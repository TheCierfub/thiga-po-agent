import path from "node:path";
import { loadPoDecisions } from "@/core/data/load";
import { ReplayProvider } from "@/core/llm/fixtures";
import { runBatch, type RunResult } from "@/core/pipeline/run";
import { DEMO_BATCHES, type DemoBatch } from "./batches";

export const ROOT = process.cwd();

let runs: Promise<Record<DemoBatch, RunResult>> | null = null;

/**
 * Mode démo sans clé : les réponses LLM sont rejouées depuis fixtures/llm, puis lundi et jeudi
 * passent dans le même pipeline que la CLI (jeudi reprend l'état de lundi).
 */
export function demoRuns(): Promise<Record<DemoBatch, RunResult>> {
  runs ??= (async () => {
    const decisions = loadPoDecisions(ROOT, "data/po-decisions.json");
    const provider = new ReplayProvider(path.join(ROOT, "fixtures/llm"));
    const lundi = await runBatch({ root: ROOT, batch: "lundi", provider, reachMode: "comptes", decisions, previous: null });
    const jeudi = await runBatch({ root: ROOT, batch: "jeudi", provider, reachMode: "comptes", decisions, previous: lundi.state });
    return { lundi, jeudi };
  })().catch((error: unknown) => {
    runs = null;
    throw error;
  });
  return runs;
}

export async function demoRun(batch: DemoBatch): Promise<RunResult> {
  return (await demoRuns())[batch];
}

export function feedbackUrl(batch: DemoBatch): (feedbackId: string) => string {
  const base = (process.env.ETAI_PUBLIC_URL ?? "http://localhost:43217").replace(/\/$/, "");
  return (id) => `${base}/${batch}/feedbacks#${id}`;
}

export { DEMO_BATCHES };
