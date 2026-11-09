import { FeedbackSchema, type Feedback } from "../schemas";
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
    author: feedback.author,
    source_account_id: feedback.sourceAccountId,
    language: feedback.language,
    body: feedback.text,
    origin,
  };
}

export function rowToFeedback(row: FeedbackRow): { feedback: Feedback; origin: FeedbackOrigin } {
  return {
    feedback: FeedbackSchema.parse({
      id: row.id,
      batch: row.batch,
      channel: row.channel,
      receivedAt: row.received_at_raw,
      author: row.author,
      sourceAccountId: row.source_account_id,
      language: row.language,
      text: row.body,
    }),
    origin: FeedbackOriginSchema.parse(row.origin),
  };
}
