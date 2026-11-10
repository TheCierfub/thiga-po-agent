import { z } from "zod";
import type { Context } from "../data/load";
import type { PoDecisions } from "../decisions/po-decisions";
import type { DecisionPlan } from "../llm/profiles";
import type { DecisionEngine, DecisionRequest, DecisionResult } from "../llm/decisions";
import type { LlmProvider, LlmRequest } from "../llm/provider";
import { ChannelSchema, FeedbackSchema, type Feedback } from "../schemas";
import { annotateEngagedFeedback, type LinearComments } from "../export/comment";
import type { AnalysisStore } from "../store/types";
import { costOf, stepDurations, themeMoves, type IngestCall, type IngestDecision, type IngestTrace, type TimedCall } from "./ingest-trace";
import { readThemeConfidence } from "../steps/decide";
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
  themeConfidence?: number;
}): Promise<RunResult> {
  // La fenêtre du lot ne glisse pas : un feedback daté après la revue (le 9 novembre
  // alors que jeudi s'arrête le 6) ferait sortir des messages du début de fenêtre et
  // changerait le RICE de thèmes non touchés. Le nouveau feedback est compté à part.
  const referenceDate = options.previous.referenceDate;
  return advanceRun({
    batch: options.previous.batch,
    referenceDate,
    incoming: [options.feedback],
    provider: options.provider,
    reachMode: options.previous.reachMode,
    decisions: options.decisions,
    previous: options.previous,
    context: options.context,
    draftStory: false,
    decider: options.decider,
    trustDeclaredAccount: true,
    strictAttachment: true,
    themeConfidence: options.themeConfidence,
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

function timeDecisions(plan: DecisionPlan | undefined, spans: TimedCall[]): DecisionPlan | undefined {
  if (!plan) return plan;
  const cache = new Map<DecisionEngine, DecisionEngine>();
  const wrap = (engine: DecisionEngine | undefined) => {
    if (!engine) return undefined;
    const existing = cache.get(engine);
    if (existing) return existing;
    const timed: DecisionEngine = {
      name: engine.name,
      async decide(request: DecisionRequest): Promise<DecisionResult> {
        const started = Date.now();
        try {
          return await engine.decide(request);
        } finally {
          spans.push({ task: request.step, key: request.key, durationMs: Date.now() - started });
        }
      },
    };
    cache.set(engine, timed);
    return timed;
  };
  return {
    type: wrap(plan.type),
    injection: wrap(plan.injection),
    critical: wrap(plan.critical),
    backlog: wrap(plan.backlog),
    theme: wrap(plan.theme),
  };
}

function buildTrace(input: {
  feedbackId: string;
  spans: TimedCall[];
  usage: UsageRecord[];
  writeMs: number;
  changes: ChangeReport | null;
  rationaleFor: (key: string) => { rationale: string | null; relatedThemeIds: string[] };
  decision: IngestDecision | null;
}): IngestTrace {
  const calls = callsFrom(input.spans, input.usage);
  return {
    feedbackId: input.feedbackId,
    steps: stepDurations(input.spans, input.writeMs),
    calls,
    costUsd: costOf(calls),
    themes: themeMoves(input.changes?.themes ?? [], input.rationaleFor),
    decision: input.decision,
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
  themeConfidence?: number;
  /** Jetons et coût par appel HTTP, lus après l'analyse. Absent avec un faux client. */
  usage?: () => UsageRecord[];
  log?: (line: string) => void;
  /** null : Linear injoignable, le commentaire est mis en attente. Absent : pas de commentaire (tests, démo). */
  linear?: LinearComments | null;
  /** Espace et équipe de la connexion qui tente le commentaire. */
  linearScope?: { workspaceId: string; teamId: string } | null;
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
  const previousReach = new Map(stored.state.rice.map((score) => [score.themeKey, score.reach.accounts.length]));
  const result = await appendFeedback({
    feedback: options.feedback,
    previous: stored.state,
    provider: timer,
    decisions: options.decisions,
    context: options.context,
    decider: timeDecisions(options.decider, timer.spans),
    themeConfidence: options.themeConfidence ?? readThemeConfidence(),
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
  const classification = result.state.classifications.find((item) => item.feedbackId === options.feedback.id);
  const attachment = result.state.attachments?.find((item) => item.feedbackId === options.feedback.id);
  const choice = classification?.themeChoice;
  const decision: IngestDecision | null = choice
    ? {
        engine: choice.engine,
        choice: choice.themeKey ?? "aucun",
        confidence: choice.confidence,
        probability: choice.probability,
        fallbackUsed: choice.fallbackUsed,
        attached: attachment?.action === "rattacher" && Boolean(attachment.engine),
      }
    : null;
  const draft = buildTrace({
    feedbackId: options.feedback.id,
    spans: timer.spans,
    usage: options.usage?.() ?? [],
    writeMs: 0,
    changes: result.changes,
    rationaleFor,
    decision,
  });
  let state = result.state;
  if (options.linear !== undefined) {
    const joined = state.themes.find(
      (theme) => theme.linearExport && (theme.feedbackIds.includes(options.feedback.id) || theme.relatedSignalIds.includes(options.feedback.id)),
    );
    state = await annotateEngagedFeedback(
      state,
      options.feedback,
      options.context.accounts,
      joined ? (previousReach.get(joined.key) ?? 0) : 0,
      options.linear,
      options.linearScope,
    );
  }
  const changes = result.changes ? { ...result.changes, ingest: draft } : result.changes;
  try {
    await options.store.saveRun({
      state,
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
      .saveRun({ state, newFeedbackIds: result.newFeedbackIds, changes: saved })
      .catch(() => undefined);
  }
  const line = JSON.stringify({ event: "feedback.ingest", ...trace });
  (options.log ?? console.log)(line.replace(/sk-or-[\w-]+/g, "[clé]").replace(/sb_(?:publishable|secret)_[\w-]+/g, "[clé]"));
  return { result: saved ? { ...result, state, changes: saved } : { ...result, state }, elapsedMs: Date.now() - started, trace };
}
