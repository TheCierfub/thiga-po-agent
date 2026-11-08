import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DecisionStepSchema } from "../schemas";
import { ReplayDecisionEngine } from "./decisions";
import { ReplayProvider } from "./fixtures";
import { OpenRouterClient } from "./openrouter/client";
import type { Meter } from "./openrouter/meter";
import type { DecisionPlan } from "./profiles";

export const FIXTURES_DIR = "fixtures/llm";

/** Décrit des fixtures enregistrées : quel profil, quelles étapes de décision rejouer et comment elles étaient groupées. */
export const FixturesManifestSchema = z.object({
  profile: z.string(),
  origin: z.literal("enregistree"),
  steps: z.record(z.string(), z.string()),
  decisionGroups: z.array(z.array(DecisionStepSchema)),
  decisionEngines: z.record(z.string(), z.string()),
});
export type FixturesManifest = z.infer<typeof FixturesManifestSchema>;

export function manifestPath(dir: string): string {
  return path.join(dir, "manifest.json");
}

export function readManifest(dir: string): FixturesManifest | null {
  const file = manifestPath(dir);
  return existsSync(file) ? FixturesManifestSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : null;
}

export function replayRuntime(root: string, options: { allowStale?: boolean } = {}) {
  const dir = path.join(root, FIXTURES_DIR);
  const replay = new ReplayProvider(dir, { allowStale: options.allowStale });
  const decider: DecisionPlan = {};
  const manifest = readManifest(dir);
  for (const group of manifest?.decisionGroups ?? []) {
    const engine = new ReplayDecisionEngine(dir, { allowStale: options.allowStale, staleKeys: replay.staleKeys });
    for (const step of group) decider[step] = engine;
  }
  return { replay, decider, manifest };
}

export function openRouterClientFromEnv(options: {
  meter: Meter;
  rawLogFile?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  retry?: { attempts: number; delayMs: number };
  generationLookup?: { attempts: number; delayMs: number };
}): OpenRouterClient {
  const env = options.env ?? process.env;
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY est absente de l'environnement.");
  return new OpenRouterClient({
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL || undefined,
    fetch: options.fetch,
    meter: options.meter,
    rawLogFile: options.rawLogFile,
    retry: options.retry,
    generationLookup: options.generationLookup,
  });
}
