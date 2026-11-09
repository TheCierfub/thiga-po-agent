import { z } from "zod";
import type { Context } from "../data/load";
import type { PoDecisions } from "../decisions/po-decisions";
import type { DecisionPlan } from "../llm/profiles";
import type { LlmProvider, LlmRequest } from "../llm/provider";
import { ChannelSchema, FeedbackSchema, type Feedback } from "../schemas";
import { localDate } from "../scoring/window";
import type { AnalysisStore } from "../store/types";
import { costOf, stepDurations, themeMoves, type IngestCall, type IngestTrace, type TimedCall } from "./ingest-trace";
import type { RunState } from "./state";
import { advanceRun, type ChangeReport, type RunResult } from "./run";

export const LIVE_BATCH = "jeudi";

export const DirectFeedbackInputSchema = z.object({
  channel: ChannelSchema,
  sourceAccountId: z.string().trim().min(1).nullable(),
  authorName: z.string().trim().max(120).nullable(),
  language: z.enum(["fr", "en"]),
  text: z.string().trim().min(1, "Le feedback est vide.").max(8000, "8000 caractères maximum."),
});
export type DirectFeedbackInput = z.infer<typeof DirectFeedbackInputSchema>;

export class DirectIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectIngestError";
  }
}

/** Identifiant stable, sans donnée personnelle. */
export function directFeedbackId(now: Date, nonce: string): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  return `fb-direct-${stamp}-${nonce}`;
}

export function buildDirectFeedback(input: DirectFeedbackInput, now = new Date(), nonce = Math.random().toString(36).slice(2, 8)): Feedback {
  const name = input.authorName?.trim() || null;
  return FeedbackSchema.parse({
    id: directFeedbackId(now, nonce),
    batch: LIVE_BATCH,
    channel: input.channel,
    receivedAt: now.toISOString(),
    author: { name, email: null, handle: null, anonymous: name === null },
    sourceAccountId: input.sourceAccountId,
    language: input.language,
    text: input.text,
  });
}

/**
 * Ajoute un feedback au lot déjà analysé.
 * Le modèle ne revoit que ce feedback (classification, rattachement) et les thèmes
 * dont les preuves changent. Les scores de tous les thèmes sont recalculés.
 * La fenêtre glisse jusqu'à la date du feedback pour qu'il entre dans le Reach.
 */
export function appendFeedback(options: {
  feedback: Feedback;
  previous: RunState;
  provider: LlmProvider;
  decisions: PoDecisions;
  context: Context;
  decider?: DecisionPlan;
  draftStory?: boolean;
}): Promise<RunResult> {
  const received = localDate(options.feedback.receivedAt);
  const referenceDate = received > options.previous.referenceDate ? received : options.previous.referenceDate;
  return advanceRun({
    batch: options.previous.batch,
    referenceDate,
    incoming: [options.feedback],
    provider: options.provider,
    reachMode: options.previous.reachMode,
    decisions: options.decisions,
    previous: options.previous,
    context: options.context,
    draftStory: options.draftStory,
    decider: options.decider,
    trustDeclaredAccount: true,
    strictAttachment: true,
  });
}

class TimingProvider implements LlmProvider {
  readonly name: string;
  readonly spans: TimedCall[] = [];

  constructor(private readonly inner: LlmProvider) {
    this.name = inner.name;
  }

  async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    const started = Date.now();
    try {
      return await this.inner.generate(request);
    } finally {
      this.spans.push({ task: request.task, key: request.key, durationMs: Date.now() - started });
    }
  }
}

export interface UsageRecord {
  task: string;
  key: string;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
}

function callsFrom(spans: TimedCall[], usage: UsageRecord[]): IngestCall[] {
  if (usage.length === 0) {
    return spans.map((span) => ({
      task: span.task,
      key: span.key,
      durationMs: span.durationMs,
      promptTokens: null,
      completionTokens: null,
      reasoningTokens: null,
      costUsd: null,
    }));
  }
  return usage.map((call) => ({ ...call }));
}

function buildTrace(input: {
  feedbackId: string;
  spans: TimedCall[];
  usage: UsageRecord[];
  writeMs: number;
  changes: ChangeReport | null;
  rationaleFor: (key: string) => { rationale: string | null; relatedThemeIds: string[] };
}): IngestTrace {
  const calls = callsFrom(input.spans, input.usage);
  return {
    feedbackId: input.feedbackId,
    steps: stepDurations(input.spans, input.writeMs),
    calls,
    costUsd: costOf(calls),
    themes: themeMoves(input.changes?.themes ?? [], input.rationaleFor),
  };
}

/** Analyse puis enregistre. Si l'analyse échoue, rien n'est écrit. Une ligne JSON est loguée, sans clé ni texte brut. */
export async function ingestDirectFeedback(options: {
  store: AnalysisStore;
  feedback: Feedback;
  provider: LlmProvider;
  decisions: PoDecisions;
  context: Context;
  decider?: DecisionPlan;
  /** Jetons et coût par appel HTTP, lus après l'analyse. Absent avec un faux client. */
  usage?: () => UsageRecord[];
  log?: (line: string) => void;
}): Promise<{ result: RunResult; elapsedMs: number; trace: IngestTrace }> {
  const started = Date.now();
  const stored = await options.store.getRun(options.feedback.batch);
  if (!stored) {
    throw new DirectIngestError(`Le lot ${options.feedback.batch} n'est pas en base. Lancez pnpm db:seed.`);
  }
  if (stored.state.feedbacks.some((f) => f.id === options.feedback.id)) {
    throw new DirectIngestError(`Ce feedback est déjà enregistré (${options.feedback.id}).`);
  }
  const timer = new TimingProvider(options.provider);
  const result = await appendFeedback({
    feedback: options.feedback,
    previous: stored.state,
    provider: timer,
    decisions: options.decisions,
    context: options.context,
    decider: options.decider,
  });
  const rationaleFor = (key: string) => {
    const attachment = result.state.attachments?.find((item) => item.feedbackId === options.feedback.id && item.themeKey === key);
    const theme = result.state.themes.find((item) => item.key === key);
    return {
      rationale: attachment?.rationale ?? theme?.creationRationale ?? null,
      relatedThemeIds: theme?.relatedThemeIds ?? attachment?.relatedThemeIds ?? [],
    };
  };
  const persistStarted = Date.now();
  await options.store.upsertFeedbacks([{ feedback: options.feedback, origin: "direct" }]);
  const draft = buildTrace({
    feedbackId: options.feedback.id,
    spans: timer.spans,
    usage: options.usage?.() ?? [],
    writeMs: 0,
    changes: result.changes,
    rationaleFor,
  });
  const changes = result.changes ? { ...result.changes, ingest: draft } : result.changes;
  try {
    await options.store.saveRun({
      state: result.state,
      newFeedbackIds: result.newFeedbackIds,
      changes,
    });
  } catch (error) {
    await options.store.deleteFeedback(options.feedback.id);
    throw error;
  }
  const trace = { ...draft, steps: stepDurations(timer.spans, Date.now() - persistStarted) };
  const saved = changes ? { ...changes, ingest: trace } : null;
  if (saved) {
    await options.store
      .saveRun({ state: result.state, newFeedbackIds: result.newFeedbackIds, changes: saved })
      .catch(() => undefined);
  }
  const line = JSON.stringify({ event: "feedback.ingest", ...trace });
  (options.log ?? console.log)(line.replace(/sk-or-[\w-]+/g, "[clé]").replace(/sb_(?:publishable|secret)_[\w-]+/g, "[clé]"));
  return { result: saved ? { ...result, changes: saved } : result, elapsedMs: Date.now() - started, trace };
}
