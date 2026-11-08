import { replayDemo, feedbackUrlFor } from "@/core/pipeline/replay-demo";
import type { RunResult } from "@/core/pipeline/run";
import type { DemoBatch } from "./batches";

export const ROOT = process.cwd();

let runs: Promise<Record<DemoBatch, RunResult>> | null = null;

export function demoRuns(): Promise<Record<DemoBatch, RunResult>> {
  runs ??= replayDemo(ROOT).catch((error: unknown) => {
    runs = null;
    throw error;
  });
  return runs;
}

export async function demoRun(batch: DemoBatch): Promise<RunResult> {
  return (await demoRuns())[batch];
}

export function feedbackUrl(batch: DemoBatch): (feedbackId: string) => string {
  return feedbackUrlFor(batch);
}
