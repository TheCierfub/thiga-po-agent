import { z } from "zod";
import { ChannelSchema } from "./source";

export const AuthorSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  handle: z.string().nullable(),
  anonymous: z.boolean(),
});
export type Author = z.infer<typeof AuthorSchema>;

export const FeedbackSchema = z.object({
  id: z.string().min(1),
  batch: z.string().min(1),
  channel: ChannelSchema,
  receivedAt: z.iso.datetime({ offset: true }),
  author: AuthorSchema,
  /** Compte déclaré par la source. Le rapprochement le recalcule et signale un désaccord. */
  sourceAccountId: z.string().nullable(),
  language: z.enum(["fr", "en"]),
  text: z.string().min(1),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const PII_KINDS = ["email", "telephone", "adresse"] as const;
export const PiiKindSchema = z.enum(PII_KINDS);
export type PiiKind = z.infer<typeof PiiKindSchema>;

export const MaskedFeedbackSchema = FeedbackSchema.extend({
  /** Seul texte transmis au LLM, et seul texte dans lequel une citation peut être vérifiée. */
  maskedText: z.string().min(1),
  pii: z.array(z.object({ kind: PiiKindSchema, count: z.number().int().positive() })),
});
export type MaskedFeedback = z.infer<typeof MaskedFeedbackSchema>;

export const IDENTITY_CONFIDENCES = [
  "certaine",
  "probable",
  "faible",
  "non_rapproche",
  "anonyme",
] as const;
export const IdentityConfidenceSchema = z.enum(IDENTITY_CONFIDENCES);
export type IdentityConfidence = z.infer<typeof IdentityConfidenceSchema>;

export const AuthorMatchSchema = z.object({
  feedbackId: z.string(),
  /** Rempli seulement si la confiance est « certaine ». */
  accountId: z.string().nullable(),
  /** Compte suggéré sans certitude (même domaine e-mail), jamais compté dans le Reach. */
  candidateAccountId: z.string().nullable(),
  confidence: IdentityConfidenceSchema,
  method: z.enum(["email", "pseudo", "domaine", "aucune"]),
  explanation: z.string(),
  sourceDisagreement: z.boolean(),
});
export type AuthorMatch = z.infer<typeof AuthorMatchSchema>;
