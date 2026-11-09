import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { RunState } from "../pipeline/state";
import { SentimentSchema, type Sentiment } from "../schemas";

const DemoSentimentFileSchema = z.object({
  note: z.string(),
  values: z.record(z.string(), SentimentSchema),
});

export function loadDemoSentiments(root: string): Record<string, Sentiment> {
  const file = path.join(root, "fixtures/sentiment/demo.json");
  return DemoSentimentFileSchema.parse(JSON.parse(readFileSync(file, "utf8"))).values;
}

/** Pose les sentiments de démo sur les classifications du lot rejoué. Les décisions Jev ne sont pas écrasées si elles existent déjà. */
export function applyDemoSentiments(state: RunState, values: Readonly<Record<string, Sentiment>>): RunState {
  return {
    ...state,
    classifications: state.classifications.map((item) => {
      if (item.sentiment) return item;
      const sentiment = values[item.feedbackId];
      return sentiment ? { ...item, sentiment } : item;
    }),
  };
}
