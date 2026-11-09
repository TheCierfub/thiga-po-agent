"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadContext, loadPoDecisions } from "@/core/data/load";
import { createLiveProvider } from "@/core/llm/live-profile";
import {
  DirectFeedbackInputSchema,
  DirectIngestError,
  LIVE_BATCH,
  buildDirectFeedback,
  ingestDirectFeedback,
} from "@/core/pipeline/direct";
import { DEMO_DECISIONS_FILE } from "@/core/pipeline/replay-demo";
import { OUTBOX_DIR, buildRecontactDrafts, writeToOutbox } from "@/core/outbox/recontact";
import { FORCEABLE_CLASSES, PoOverridesSchema, reprioritize } from "@/core/scoring/overrides";
import { SizeSchema } from "@/core/schemas";
import { buildBacklogItems, type SinkResult } from "@/core/sink/backlog-sink";
import { LINEAR_EXPORT_DIR, exportTarget } from "@/core/sink/export-target";
import { DEMO_BATCHES } from "@/lib/etai/batches";
import { resolveDataMode } from "@/lib/etai/data-mode";
import { ROOT, feedbackUrl } from "@/lib/etai/runs";
import { getBatchView } from "@/lib/etai/view";

function scrub(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/sk-or-[\w-]+/g, "[clé]").replace(/sb_(?:publishable|secret)_[\w-]+/g, "[clé]").slice(0, 400);
}

const OverridesSchema = z.object({
  effort: z.record(z.string(), SizeSchema),
  forced: z.record(z.string(), z.object({ moscow: z.enum(FORCEABLE_CLASSES), motif: z.string().max(500) })),
});

const ExportInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  themeKey: z.string().regex(/^[a-z0-9_]+$/),
  overrides: OverridesSchema,
});

export type ExportOutcome =
  | { ok: true; mode: "linear" | "markdown"; label: string; reason: string | null; result: SinkResult; location: string | null }
  | { ok: false; message: string };

export async function exportTheme(input: z.input<typeof ExportInput>): Promise<ExportOutcome> {
  const parsed = ExportInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Demande d'export invalide." };
  const { batch, themeKey, overrides } = parsed.data;
  const view = await getBatchView(batch);
  const accounts = new Map(loadContext(ROOT).accounts.map((account) => [account.id, account]));
  const { rice, allocation } = reprioritize(view.state, view.strategy, overrides);
  const url = feedbackUrl(batch);
  const [item] = buildBacklogItems(
    { state: { ...view.state, rice, allocation }, accounts, strategy: view.strategy },
    { feedbackUrl: url, themeKeys: [themeKey] },
  );
  if (!item) return { ok: false, message: "Ce thème n'est ni Must, ni Should, ni Could : il ne part pas vers le backlog." };

  const target = exportTarget({ root: ROOT, feedbackUrl: url });
  try {
    const [result] = await target.sink.push([item]);
    if (!result) return { ok: false, message: "L'export n'a renvoyé aucun résultat." };
    const location =
      target.mode === "markdown" && result.target ? `${LINEAR_EXPORT_DIR}/${result.target}` : (result.url ?? result.target ?? null);
    return { ok: true, mode: target.mode, label: target.label, reason: target.reason, result, location };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `${target.label} a refusé l'export : ${detail}` };
  }
}

const OutboxInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  feedbackId: z.string(),
  subject: z.string().max(300).nullable(),
  body: z.string().trim().min(1, "Le message est vide.").max(5000),
});

export type OutboxOutcome = { ok: true; file: string } | { ok: false; message: string };

/** Dépose le message dans la boîte de test. Aucun envoi : ni e-mail, ni message privé, ni réponse publique. */
export async function sendToOutbox(input: z.input<typeof OutboxInput>): Promise<OutboxOutcome> {
  const parsed = OutboxInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Message invalide." };
  const { batch, feedbackId, subject, body } = parsed.data;
  const view = await getBatchView(batch);
  const draft = buildRecontactDrafts(view.state).find((d) => d.feedbackId === feedbackId);
  if (!draft) return { ok: false, message: "Aucun brouillon de recontact pour ce feedback." };
  const file = writeToOutbox(path.join(ROOT, OUTBOX_DIR), {
    feedbackId,
    batch,
    channel: draft.channel,
    replyMode: draft.replyMode,
    recipient: draft.recipient,
    subject,
    body,
  });
  return { ok: true, file: path.relative(ROOT, file) };
}

const ArbitrageInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  overrides: PoOverridesSchema,
});

export type ArbitrageOutcome = { ok: true } | { ok: false; message: string };

/** Enregistre les arbitrages du PO. En mode démo, l'interface les garde dans le navigateur. */
export async function saveArbitrages(input: z.input<typeof ArbitrageInput>): Promise<ArbitrageOutcome> {
  const parsed = ArbitrageInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Arbitrage invalide." };
  const mode = await resolveDataMode();
  if (mode.kind !== "live") return { ok: false, message: "Mode démo : l'arbitrage reste dans ce navigateur." };
  const { batch, overrides } = parsed.data;
  const current = await mode.store.getArbitrages(batch);
  const decisions = current?.decisions ?? loadPoDecisions(ROOT, DEMO_DECISIONS_FILE);
  try {
    await mode.store.saveArbitrages(batch, { decisions, overrides });
  } catch (error) {
    return { ok: false, message: `Enregistrement impossible : ${scrub(error)}` };
  }
  revalidatePath(`/${batch}`, "layout");
  return { ok: true };
}

export type AddFeedbackOutcome =
  | {
      ok: true;
      elapsedMs: number;
      feedbackId: string;
      themeKey: string | null;
      themeTitle: string | null;
      createdTheme: boolean;
      riceBefore: number | null;
      riceAfter: number | null;
      moscowBefore: string | null;
      moscowAfter: string | null;
    }
  | { ok: false; message: string };

/**
 * Colle un feedback, l'analyse avec OpenRouter (seulement ce feedback et les thèmes touchés),
 * l'enregistre et recalcule la priorisation du lot en cours.
 */
export async function addFeedback(input: z.input<typeof DirectFeedbackInputSchema>): Promise<AddFeedbackOutcome> {
  const parsed = DirectFeedbackInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Feedback invalide." };
  const mode = await resolveDataMode();
  if (mode.kind !== "live") {
    return { ok: false, message: "Mode démo : rien n'est enregistré et aucun modèle n'est appelé." };
  }
  const context = loadContext(ROOT);
  if (parsed.data.sourceAccountId && !context.accounts.some((account) => account.id === parsed.data.sourceAccountId)) {
    return { ok: false, message: "Compte client inconnu." };
  }
  const feedback = buildDirectFeedback(parsed.data);
  const decisions = (await mode.store.getArbitrages(LIVE_BATCH))?.decisions ?? loadPoDecisions(ROOT, DEMO_DECISIONS_FILE);
  try {
    const live = createLiveProvider(ROOT);
    const { result, elapsedMs } = await ingestDirectFeedback({
      store: mode.store,
      feedback,
      provider: live.provider,
      decisions,
      context,
      decider: live.decider,
    });
    revalidatePath("/lundi", "layout");
    revalidatePath("/jeudi", "layout");
    const theme = result.state.themes.find(
      (item) => item.feedbackIds.includes(feedback.id) || item.relatedSignalIds.includes(feedback.id),
    );
    const change = theme ? result.changes?.themes.find((item) => item.key === theme.key) : undefined;
    return {
      ok: true,
      elapsedMs,
      feedbackId: feedback.id,
      themeKey: theme?.key ?? null,
      themeTitle: theme?.title ?? null,
      createdTheme: theme ? (result.changes?.plan.newThemes.includes(theme.key) ?? false) : false,
      riceBefore: change?.riceBefore ?? null,
      riceAfter: change?.riceAfter ?? null,
      moscowBefore: change?.moscowBefore ?? null,
      moscowAfter: change?.moscowAfter ?? null,
    };
  } catch (error) {
    const message = error instanceof DirectIngestError ? error.message : scrub(error);
    return { ok: false, message };
  }
}
