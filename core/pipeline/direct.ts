import { z } from "zod";
import type { Context } from "../data/load";
import type { PoDecisions } from "../decisions/po-decisions";
import type { DecisionPlan } from "../llm/profiles";
import type { LlmProvider } from "../llm/provider";
import { ChannelSchema, FeedbackSchema, type Feedback } from "../schemas";
import { localDate } from "../scoring/window";
import type { AnalysisStore } from "../store/types";
import type { RunState } from "./state";
import { advanceRun, type RunResult } from "./run";

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
  });
}

/** Analyse puis enregistre. Si l'analyse échoue, rien n'est écrit. */
export async function ingestDirectFeedback(options: {
  store: AnalysisStore;
  feedback: Feedback;
  provider: LlmProvider;
  decisions: PoDecisions;
  context: Context;
  decider?: DecisionPlan;
}): Promise<{ result: RunResult; elapsedMs: number }> {
  const started = Date.now();
  const stored = await options.store.getRun(options.feedback.batch);
  if (!stored) {
    throw new DirectIngestError(`Le lot ${options.feedback.batch} n'est pas en base. Lancez pnpm db:seed.`);
  }
  if (stored.state.feedbacks.some((f) => f.id === options.feedback.id)) {
    throw new DirectIngestError(`Ce feedback est déjà enregistré (${options.feedback.id}).`);
  }
  const result = await appendFeedback({
    feedback: options.feedback,
    previous: stored.state,
    provider: options.provider,
    decisions: options.decisions,
    context: options.context,
    decider: options.decider,
  });
  await options.store.upsertFeedbacks([{ feedback: options.feedback, origin: "direct" }]);
  try {
    await options.store.saveRun({
      state: result.state,
      newFeedbackIds: result.newFeedbackIds,
      changes: result.changes,
    });
  } catch (error) {
    await options.store.deleteFeedback(options.feedback.id);
    throw error;
  }
  return { result, elapsedMs: Date.now() - started };
}
