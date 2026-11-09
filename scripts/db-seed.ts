import { existsSync } from "node:fs";
import path from "node:path";
import { loadBatchFile, loadPoDecisions } from "../core/data/load";
import { ingestBatch } from "../core/ingest/connectors";
import { replayDemo } from "../core/pipeline/replay-demo";
import { NO_OVERRIDES } from "../core/scoring/overrides";
import { readSupabaseConfig } from "../core/store/env";
import { createSupabaseStore } from "../core/store/supabase";

const root = path.resolve(import.meta.dirname, "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = readSupabaseConfig();
if (!config) {
  console.error("SUPABASE_URL et SUPABASE_KEY sont requis. Copier .env.example vers .env, sans committer .env.");
  process.exit(1);
}

const store = createSupabaseStore(config);
await store.ping();

const { lundi, jeudi } = await replayDemo(root);
const feedbacks = [...ingestBatch(loadBatchFile(root, "lundi")), ...ingestBatch(loadBatchFile(root, "jeudi"))];
const decisions = loadPoDecisions(root, "data/po-decisions.json");

await store.resetDemo({
  feedbacks,
  runs: [lundi, jeudi].map((result) => ({
    state: result.state,
    newFeedbackIds: result.newFeedbackIds,
    changes: result.changes,
  })),
  arbitrages: (["lundi", "jeudi"] as const).map((batch) => ({
    batch,
    value: { decisions, overrides: NO_OVERRIDES },
  })),
});

console.log(
  `Seed terminé : ${feedbacks.length} feedbacks bruts, analyses de lundi et de jeudi. Les feedbacks ajoutés en direct ont été retirés, les arbitrages de l'interface aussi.`,
);
