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
import type { IngestTrace } from "@/core/pipeline/ingest-trace";
import { DEMO_DECISIONS_FILE } from "@/core/pipeline/replay-demo";
import { OUTBOX_DIR, buildRecontactDrafts, writeToOutbox } from "@/core/outbox/recontact";
import { FORCEABLE_CLASSES, PoOverridesSchema, reprioritize } from "@/core/scoring/overrides";
import { SizeSchema, UserStoryDraftSchema, type UserStoryDraft } from "@/core/schemas";
import { draftStory } from "@/core/steps/draft-story";
import { placeStory } from "@/core/stories/place";
import { ReplayProvider } from "@/core/llm/fixtures";
import { buildBacklogItems, type SinkResult } from "@/core/sink/backlog-sink";
import { LINEAR_EXPORT_DIR, exportTarget } from "@/core/sink/export-target";
import { DEMO_BATCHES } from "@/lib/etai/batches";
import { resolveDataMode } from "@/lib/etai/data-mode";
import { ROOT, feedbackUrl } from "@/lib/etai/runs";
import { getBatchView } from "@/lib/etai/view";
import { DEFAULT_X_QUERY, capMicro, readMaxAgeDays, readSessionCapUsd } from "@/core/sources/x-listen";
import { TregError, runXPoll, type PollPostResult, type TregCallTrace } from "@/core/sources/x";

function scrub(error: unknown): string {
  const token = process.env.TREG_TOKEN?.trim();
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/sk-or-[\w-]+/g, "[clé]")
    .replace(/sb_(?:publishable|secret)_[\w-]+/g, "[clé]");
  const hidden = token ? message.split(token).join("[clé]") : message;
  return hidden.slice(0, 400);
}

const OverridesSchema = z.object({
  effort: z.record(z.string(), SizeSchema),
  forced: z.record(z.string(), z.object({ moscow: z.enum(FORCEABLE_CLASSES), motif: z.string().max(500) })),
});

const ExportInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  themeKey: z.string().regex(/^[a-z0-9_]+$/),
  overrides: OverridesSchema,
  story: UserStoryDraftSchema.optional(),
});

export type ExportOutcome =
  | { ok: true; mode: "linear" | "markdown"; label: string; reason: string | null; result: SinkResult; location: string | null }
  | { ok: false; message: string };

export async function exportTheme(input: z.input<typeof ExportInput>): Promise<ExportOutcome> {
  const parsed = ExportInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Demande d'export invalide." };
  const { batch, themeKey, overrides, story } = parsed.data;
  const view = await getBatchView(batch);
  if (story && story.themeKey !== themeKey) return { ok: false, message: "La story ne correspond pas à ce thème." };
  if (story) await persistStory(batch, story);
  const accounts = new Map(loadContext(ROOT).accounts.map((account) => [account.id, account]));
  const { rice, allocation } = reprioritize(view.state, view.strategy, overrides);
  const stories = story ? placeStory(view.state.stories, story) : view.state.stories;
  const url = feedbackUrl(batch);
  const [item] = buildBacklogItems(
    { state: { ...view.state, stories, rice, allocation }, accounts, strategy: view.strategy },
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
  | { ok: true; elapsedMs: number; feedbackId: string; trace: IngestTrace }
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
    const { elapsedMs, trace } = await ingestDirectFeedback({
      store: mode.store,
      feedback,
      provider: live.provider,
      decisions,
      context,
      decider: live.decider,
      usage: () =>
        live.meter.records.map((call) => ({
          task: call.step,
          key: "",
          durationMs: call.latencyMs,
          promptTokens: call.promptTokens,
          completionTokens: call.completionTokens,
          reasoningTokens: call.reasoningTokens,
          costUsd: call.costUsd,
        })),
    });
    revalidatePath("/lundi", "layout");
    revalidatePath("/jeudi", "layout");
    return { ok: true, elapsedMs, feedbackId: feedback.id, trace };
  } catch (error) {
    const message = error instanceof DirectIngestError ? error.message : scrub(error);
    return { ok: false, message };
  }
}

const PollInput = z.object({
  activatedAt: z.iso.datetime({ offset: true }),
  lookbackHours: z.number().min(0).max(72),
  spentMicro: z.number().int().nonnegative(),
});

export type PollXOutcome =
  | {
      ok: true;
      query: string;
      found: number;
      created: PollPostResult[];
      ignored: number;
      errors: string[];
      treg: TregCallTrace;
      spentMicro: number;
      stop: null | "cout";
    }
  | { ok: false; message: string; stop: boolean };

/** Un passage d'écoute. Le navigateur le rappelle tant que la page est ouverte. */
export async function pollXMentions(input: z.input<typeof PollInput>): Promise<PollXOutcome> {
  const parsed = PollInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Demande d'écoute invalide.", stop: false };
  const token = process.env.TREG_TOKEN?.trim();
  if (!token) return { ok: false, message: "TREG_TOKEN est absent : l'écoute X est désactivée.", stop: true };
  const mode = await resolveDataMode();
  if (mode.kind !== "live") return { ok: false, message: "Mode démo : rien n'est enregistré et aucun modèle n'est appelé.", stop: true };
  const capUsd = readSessionCapUsd(process.env.ETAI_X_MAX_SESSION_USD);
  if (parsed.data.spentMicro >= capMicro(capUsd)) {
    return { ok: false, message: "Plafond de la session atteint.", stop: true };
  }
  const query = process.env.ETAI_X_QUERY?.trim() || DEFAULT_X_QUERY;
  const rows = await mode.store.listFeedbacks(LIVE_BATCH);
  const run = await mode.store.getRun(LIVE_BATCH);
  const existingIds = new Set([...rows.map((row) => row.feedback.id), ...(run?.state.feedbacks.map((item) => item.id) ?? [])]);
  const context = loadContext(ROOT);
  const decisions = (await mode.store.getArbitrages(LIVE_BATCH))?.decisions ?? loadPoDecisions(ROOT, DEMO_DECISIONS_FILE);

  try {
    const result = await runXPoll({
      query,
      token,
      now: new Date(),
      activatedAt: new Date(parsed.data.activatedAt),
      lookbackHours: parsed.data.lookbackHours,
      spentMicro: parsed.data.spentMicro,
      capUsd,
      maxAgeDays: readMaxAgeDays(process.env.ETAI_X_MAX_AGE_DAYS),
      existingIds,
      ingest: async (feedback) => {
        const live = createLiveProvider(ROOT);
        const { result: ingested, trace } = await ingestDirectFeedback({
          store: mode.store,
          feedback,
          provider: live.provider,
          decisions,
          context,
          decider: live.decider,
          usage: () =>
            live.meter.records.map((call) => ({
              task: call.step,
              key: "",
              durationMs: call.latencyMs,
              promptTokens: call.promptTokens,
              completionTokens: call.completionTokens,
              reasoningTokens: call.reasoningTokens,
              costUsd: call.costUsd,
            })),
        });
        const processedAt = new Date().toISOString();
        const stamped = feedback.listening ? { ...feedback, listening: { ...feedback.listening, processedAt } } : feedback;
        const state = {
          ...ingested.state,
          feedbacks: ingested.state.feedbacks.map((item) =>
            item.id === feedback.id && item.listening ? { ...item, listening: { ...item.listening, processedAt } } : item,
          ),
        };
        await mode.store.upsertFeedbacks([{ feedback: stamped, origin: "direct" }]);
        await mode.store.saveRun({ state, newFeedbackIds: ingested.newFeedbackIds, changes: ingested.changes });
        const classification = state.classifications.find((item) => item.feedbackId === feedback.id);
        return { trace, quarantined: Boolean(classification?.injection.quarantined), processedAt };
      },
    });
    if (result.created.length > 0) {
      revalidatePath("/lundi", "layout");
      revalidatePath("/jeudi", "layout");
    }
    const spentMicro = parsed.data.spentMicro + (result.treg.costMicro ?? 0);
    return {
      ok: true,
      query,
      found: result.found,
      created: result.created,
      ignored: result.ignored.length,
      errors: result.errors.map((item) => scrub(new Error(item))),
      treg: result.treg,
      spentMicro,
      stop: spentMicro >= capMicro(capUsd) ? "cout" : null,
    };
  } catch (error) {
    const stop = error instanceof TregError && (error.status === 401 || error.status === 402);
    return { ok: false, message: scrub(error), stop };
  }
}

const ThemeInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  themeKey: z.string().regex(/^[a-z0-9_]+$/),
  overrides: OverridesSchema,
});

export type StoryOutcome =
  | { ok: true; story: UserStoryDraft; elapsedMs: number; costUsd: number | null; persisted: boolean }
  | { ok: false; message: string };

async function persistStory(batch: (typeof DEMO_BATCHES)[number], story: UserStoryDraft): Promise<boolean> {
  const mode = await resolveDataMode();
  if (mode.kind !== "live") return false;
  const stored = await mode.store.getRun(batch);
  if (!stored) return false;
  await mode.store.saveRun({
    ...stored,
    state: { ...stored.state, stories: placeStory(stored.state.stories, story) },
  });
  revalidatePath(`/${batch}`, "layout");
  return true;
}

/** Rédige la story d'un thème, à la demande. En direct, Sonnet ; en démo, la réponse déjà écrite. */
export async function generateThemeStory(input: z.input<typeof ThemeInput>): Promise<StoryOutcome> {
  const parsed = ThemeInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Demande de story invalide." };
  const { batch, themeKey, overrides } = parsed.data;
  const view = await getBatchView(batch);
  const theme = view.state.themes.find((item) => item.key === themeKey);
  const assessment = view.state.assessments.find((item) => item.themeKey === themeKey);
  if (!theme || !assessment) return { ok: false, message: "Ce thème n'a pas d'évaluation à raconter." };
  const quarantined = new Set(view.state.classifications.filter((item) => item.injection.quarantined).map((item) => item.feedbackId));
  const usable = {
    ...theme,
    feedbackIds: theme.feedbackIds.filter((id) => !quarantined.has(id)),
    quotes: theme.quotes.filter((quote) => !quarantined.has(quote.feedbackId)),
  };
  if (usable.feedbackIds.length === 0) return { ok: false, message: "Les feedbacks de ce thème sont en quarantaine : rien à rédiger." };
  const { rice, allocation } = reprioritize(view.state, view.strategy, overrides);
  const riceScore = rice.find((item) => item.themeKey === themeKey);
  const decision = allocation.decisions.find((item) => item.themeKey === themeKey);
  if (!riceScore || !decision) return { ok: false, message: "Ce thème n'a pas de score." };
  const mode = await resolveDataMode();
  const live = mode.kind === "live" ? createLiveProvider(ROOT) : null;
  const provider = live?.provider ?? new ReplayProvider(path.join(ROOT, "fixtures/llm"), { allowStale: true });
  const started = Date.now();
  try {
    const story = await draftStory(
      {
        batch,
        theme: usable,
        assessment,
        rice: riceScore,
        decision,
        feedbacks: new Map(view.state.feedbacks.map((feedback) => [feedback.id, feedback])),
        strategy: view.strategy,
        backlogIssue: theme.backlogIssueId ? (view.backlog.find((issue) => issue.id === theme.backlogIssueId) ?? null) : null,
        evidenceHash: view.state.evidence[themeKey] ?? theme.key,
      },
      provider,
    );
    const persisted = await persistStory(batch, story);
    const costUsd = live ? live.meter.records.reduce((sum, call) => sum + (call.costUsd ?? 0), 0) : null;
    return { ok: true, story, elapsedMs: Date.now() - started, costUsd, persisted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Aucune réponse enregistrée")) return { ok: false, message: "Pas de story déjà écrite pour ce thème en mode démo. Branchez OpenRouter pour la rédiger." };
    return { ok: false, message: scrub(error) };
  }
}

export async function saveThemeStory(input: { batch: (typeof DEMO_BATCHES)[number]; story: UserStoryDraft }): Promise<{ ok: true; persisted: boolean } | { ok: false; message: string }> {
  const story = UserStoryDraftSchema.safeParse(input.story);
  if (!story.success || !DEMO_BATCHES.includes(input.batch)) return { ok: false, message: "Story illisible." };
  try {
    const persisted = await persistStory(input.batch, story.data);
    return { ok: true, persisted };
  } catch (error) {
    return { ok: false, message: scrub(error) };
  }
}

