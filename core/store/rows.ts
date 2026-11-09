import { z } from "zod";
import { AuthorSchema, FeedbackSchema, ListeningSchema, type Feedback } from "../schemas";
import { FeedbackOriginSchema, type FeedbackOrigin } from "./types";

/** Ligne `public.feedbacks`. `received_at_raw` conserve l'horodatage Zod. */
export interface FeedbackRow {
  id: string;
  batch: string;
  channel: string;
  received_at: string;
  received_at_raw: string;
  author: unknown;
  source_account_id: string | null;
  language: string;
  body: string;
  origin: string;
}

export function feedbackToRow(feedback: Feedback, origin: FeedbackOrigin): FeedbackRow {
  return {
    id: feedback.id,
    batch: feedback.batch,
    channel: feedback.channel,
    received_at: feedback.receivedAt,
    received_at_raw: feedback.receivedAt,
    author: {
      ...feedback.author,
      sourceUrl: feedback.sourceUrl ?? null,
      listening: feedback.listening ?? null,
    },
    source_account_id: feedback.sourceAccountId,
    language: feedback.language,
    body: feedback.text,
    origin,
  };
}

const StoredAuthorSchema = AuthorSchema.extend({
  sourceUrl: z.string().nullable().optional(),
  listening: ListeningSchema.nullable().optional(),
});

export function rowToFeedback(row: FeedbackRow): { feedback: Feedback; origin: FeedbackOrigin } {
  const stored = StoredAuthorSchema.parse(row.author);
  return {
    feedback: FeedbackSchema.parse({
      id: row.id,
      batch: row.batch,
      channel: row.channel,
      receivedAt: row.received_at_raw,
      author: {
        name: stored.name,
        email: stored.email,
        handle: stored.handle,
        anonymous: stored.anonymous,
      },
      sourceAccountId: row.source_account_id,
      language: row.language,
      text: row.body,
      ...(stored.sourceUrl ? { sourceUrl: stored.sourceUrl } : {}),
      ...(stored.listening ? { listening: stored.listening } : {}),
    }),
    origin: FeedbackOriginSchema.parse(row.origin),
  };
}
