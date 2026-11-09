import { cache } from "react";
import { connection } from "next/server";
import { readSupabaseConfig } from "@/core/store/env";
import { createSupabaseStore } from "@/core/store/supabase";
import type { AnalysisStore, StoredRun } from "@/core/store/types";
import type { DemoBatch } from "./batches";

export const DEMO_DETAIL =
  "SUPABASE_URL ou SUPABASE_KEY absent : fixtures rejouées, aucun appel de modèle.";

export type DataMode =
  | { kind: "demo"; detail: string }
  | { kind: "live"; detail: string; store: AnalysisStore; runs: Record<DemoBatch, StoredRun> };

function scrub(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/sb_(?:publishable|secret)_[\w-]+/g, "[clé]").slice(0, 240);
}

/** Décidé à chaque requête : brancher la base ne demande qu'un redémarrage, pas un rebuild. */
export const resolveDataMode = cache(async (): Promise<DataMode> => {
  await connection();
  const config = readSupabaseConfig();
  if (!config) return { kind: "demo", detail: DEMO_DETAIL };
  const store = createSupabaseStore(config);
  try {
    await store.ping();
    const [lundi, jeudi] = await Promise.all([store.getRun("lundi"), store.getRun("jeudi")]);
    if (!lundi || !jeudi) {
      return {
        kind: "demo",
        detail: "Base joignable, mais les lots n'y sont pas. Lancez pnpm db:seed. Repli sur les fixtures, aucun appel de modèle.",
      };
    }
    return {
      kind: "live",
      detail: "Feedbacks, analyse et arbitrages lus dans Supabase.",
      store,
      runs: { lundi, jeudi },
    };
  } catch (error) {
    return {
      kind: "demo",
      detail: `Base injoignable (${scrub(error)}). Repli sur les fixtures, aucun appel de modèle.`,
    };
  }
});
