"use server";

import path from "node:path";
import { z } from "zod";
import { OUTBOX_DIR, buildRecontactDrafts, writeToOutbox } from "@/core/outbox/recontact";
import { FORCEABLE_CLASSES, reprioritize } from "@/core/scoring/overrides";
import { SizeSchema } from "@/core/schemas";
import { buildBacklogItems, type SinkResult } from "@/core/sink/backlog-sink";
import { LINEAR_EXPORT_DIR, exportTarget } from "@/core/sink/export-target";
import { DEMO_BATCHES } from "@/lib/etai/batches";
import { ROOT, demoRun, feedbackUrl } from "@/lib/etai/runs";

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
  const run = await demoRun(batch);
  const { rice, allocation } = reprioritize(run.state, run.strategy, overrides);
  const url = feedbackUrl(batch);
  const [item] = buildBacklogItems({ ...run, state: { ...run.state, rice, allocation } }, { feedbackUrl: url, themeKeys: [themeKey] });
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
  const run = await demoRun(batch);
  const draft = buildRecontactDrafts(run.state).find((d) => d.feedbackId === feedbackId);
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
