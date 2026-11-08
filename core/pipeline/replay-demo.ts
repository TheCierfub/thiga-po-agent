import { existsSync } from "node:fs";
import path from "node:path";
import { loadPoDecisions } from "../data/load";
import { EMPTY_PO_DECISIONS } from "../decisions/po-decisions";
import { ReplayProvider } from "../llm/fixtures";
import { runBatch, type RunResult } from "./run";

export const DEMO_DECISIONS_FILE = "data/po-decisions.json";

/**
 * Mode sans clé : réponses LLM rejouées depuis fixtures/llm, lundi puis jeudi (jeudi reprend l'état
 * de lundi), avec les décisions du PO. Aucun appel réseau.
 */
export async function replayDemo(root: string): Promise<{ lundi: RunResult; jeudi: RunResult }> {
  const decisions = existsSync(path.join(root, DEMO_DECISIONS_FILE)) ? loadPoDecisions(root, DEMO_DECISIONS_FILE) : EMPTY_PO_DECISIONS;
  const provider = new ReplayProvider(path.join(root, "fixtures/llm"));
  const lundi = await runBatch({ root, batch: "lundi", provider, reachMode: "comptes", decisions, previous: null });
  const jeudi = await runBatch({ root, batch: "jeudi", provider, reachMode: "comptes", decisions, previous: lundi.state });
  return { lundi, jeudi };
}

export function feedbackUrlFor(batch: string, env: Partial<Record<string, string>> = process.env): (feedbackId: string) => string {
  const base = (env.ETAI_PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? "http://localhost:43217").replace(/\/$/, "");
  return (id) => `${base}/${batch}/feedbacks#${id}`;
}
