import { z } from "zod";
import { PoDecisionsSchema, type PoDecisions } from "../decisions/po-decisions";
import { ChangeReportSchema } from "../pipeline/changes";
import type { ChangeReport } from "../pipeline/run";
import { RunStateSchema, type RunState } from "../pipeline/state";
import { PoOverridesSchema, type PoOverrides } from "../scoring/overrides";
import type { Feedback } from "../schemas";

export const FEEDBACK_ORIGINS = ["seed", "direct"] as const;
export const FeedbackOriginSchema = z.enum(FEEDBACK_ORIGINS);
export type FeedbackOrigin = z.infer<typeof FeedbackOriginSchema>;

export const StoredRunSchema = z.object({
  state: RunStateSchema,
  newFeedbackIds: z.array(z.string()),
  changes: ChangeReportSchema.nullable(),
});
export type StoredRun = z.infer<typeof StoredRunSchema>;

export const StoredArbitragesSchema = z.object({
  decisions: PoDecisionsSchema,
  overrides: PoOverridesSchema,
});
export type StoredArbitrages = z.infer<typeof StoredArbitragesSchema>;

export interface StoredFeedback {
  feedback: Feedback;
  origin: FeedbackOrigin;
}

export interface DemoReset {
  feedbacks: Feedback[];
  runs: StoredRun[];
  arbitrages: { batch: string; value: StoredArbitrages }[];
}

/** Persistance du cycle. Les implémentations valident chaque lecture avec Zod. */
export interface AnalysisStore {
  ping(): Promise<void>;
  listFeedbacks(batch?: string): Promise<StoredFeedback[]>;
  upsertFeedbacks(rows: StoredFeedback[]): Promise<void>;
  deleteFeedback(id: string): Promise<void>;
  getRun(batch: string): Promise<StoredRun | null>;
  saveRun(run: StoredRun): Promise<void>;
  getArbitrages(batch: string): Promise<StoredArbitrages | null>;
  saveArbitrages(batch: string, value: StoredArbitrages): Promise<void>;
  /** Recharge le corpus de fixtures et retire les feedbacks ajoutés en direct. */
  resetDemo(input: DemoReset): Promise<void>;
}

export class StoreError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

export function assertStoredRun(run: { state: RunState; newFeedbackIds: string[]; changes: ChangeReport | null }): StoredRun {
  const parsed = StoredRunSchema.safeParse(run);
  if (!parsed.success) throw new StoreError(`Analyse illisible : ${parsed.error.message}`);
  return parsed.data;
}

export function assertArbitrages(value: { decisions: PoDecisions; overrides: PoOverrides }): StoredArbitrages {
  const parsed = StoredArbitragesSchema.safeParse(value);
  if (!parsed.success) throw new StoreError(`Arbitrages illisibles : ${parsed.error.message}`);
  return parsed.data;
}
