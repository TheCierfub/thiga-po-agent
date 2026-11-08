import { z } from "zod";
import { SizeSchema } from "./context";
import { QuoteSchema } from "./analysis";

const InvestCriterion = z.object({ ok: z.boolean(), note: z.string().min(1) });

export const UserStoryLlmSchema = z.object({
  title: z.string().min(3),
  asA: z.string().min(3),
  iWant: z.string().min(3),
  soThat: z.string().min(3),
  acceptanceCriteria: z
    .array(z.object({ given: z.string().min(3), when: z.string().min(3), then: z.string().min(3) }))
    .min(2)
    .max(6),
  size: SizeSchema,
  referenceStoryId: z.string(),
  sizeRationale: z.string().min(3),
  invest: z.object({
    independent: InvestCriterion,
    negotiable: InvestCriterion,
    valuable: InvestCriterion,
    estimable: InvestCriterion,
    small: InvestCriterion,
    testable: InvestCriterion,
  }),
  openQuestions: z.array(z.string().min(3)).min(1).max(5),
  outOfScope: z.array(z.string()),
});
export type UserStoryLlm = z.infer<typeof UserStoryLlmSchema>;

export const UserStoryDraftSchema = UserStoryLlmSchema.extend({
  themeKey: z.string(),
  backlogIssueId: z.string().nullable(),
  evidence: z.array(QuoteSchema),
  evidenceHash: z.string(),
  batch: z.string(),
  status: z.enum(["brouillon", "obsolete"]),
});
export type UserStoryDraft = z.infer<typeof UserStoryDraftSchema>;

export const InvestigationLlmSchema = z.object({
  questions: z.array(z.string().min(5)).min(2).max(3),
  message: z.object({
    subject: z.string().nullable(),
    body: z.string().min(20),
  }),
});
export type InvestigationLlm = z.infer<typeof InvestigationLlmSchema>;

export const REPLY_MODES = ["email", "message_prive", "reponse_publique"] as const;

export const InvestigationDraftSchema = InvestigationLlmSchema.extend({
  feedbackId: z.string(),
  channel: z.string(),
  replyMode: z.enum(REPLY_MODES),
  recipient: z.string(),
  status: z.literal("brouillon_non_envoye"),
});
export type InvestigationDraft = z.infer<typeof InvestigationDraftSchema>;
