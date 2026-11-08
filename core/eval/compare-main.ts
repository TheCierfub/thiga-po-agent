import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_BUDGET_USD, DEFAULT_PROFILES, runCompare } from "./compare";

const ROOT = path.resolve(import.meta.dirname, "../..");

const USAGE = `Usage : pnpm eval:compare [options]

Évaluation réelle (lundi, jeudi, holdout) de plusieurs profils sur OpenRouter.
Prérequis : OPENROUTER_API_KEY dans l'environnement (ou dans .env).

Options :
  --profiles A,B,C            Profils de config/llm-profiles (défaut : A,B,C).
  --budget <dollars>          Plafond de dépense, tous profils confondus (défaut : ${DEFAULT_BUDGET_USD}).
  --story-model <modèle>      Modèle de rédaction de la story pour tous les profils
                              (ex. anthropic/claude-opus-5.5).
  --record-fixtures <profil>  Remplace fixtures/llm par les sorties réelles de ce profil (lundi, jeudi).
  --out <dossier>             Défaut : out/eval-real.`;

async function main() {
  const { values } = parseArgs({
    options: {
      profiles: { type: "string", default: DEFAULT_PROFILES.join(",") },
      budget: { type: "string", default: String(DEFAULT_BUDGET_USD) },
      "story-model": { type: "string" },
      "record-fixtures": { type: "string" },
      out: { type: "string", default: "out/eval-real" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const envFile = path.join(ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error(`OPENROUTER_API_KEY est absente de l'environnement.\n\n${USAGE}`);
    process.exit(2);
  }
  const budgetUsd = Number(values.budget);
  if (!(budgetUsd > 0)) throw new Error("--budget doit être un nombre positif.");
  const profiles = values.profiles.split(",").map((p) => p.trim()).filter(Boolean);
  const record = values["record-fixtures"] ?? null;
  if (record && !profiles.includes(record)) throw new Error(`--record-fixtures ${record} : ce profil n'est pas dans --profiles.`);

  const outDir = path.resolve(ROOT, values.out);
  const results = await runCompare({
    root: ROOT,
    profiles,
    budgetUsd,
    storyModel: values["story-model"] ?? null,
    recordFixtures: record,
    outDir,
    apiKey,
    baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
    log: (line) => console.log(line),
  });
  console.log(`\nRécapitulatif : ${path.relative(ROOT, path.join(outDir, "summary.md"))}`);
  for (const r of results) {
    const cost = r.stats ? `${r.stats.costUsd.toFixed(4)} $` : "—";
    console.log(`  ${r.profile} : ${r.status}, ${cost}`);
  }
  if (results.some((r) => r.status === "erreur")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `Erreur : ${error.message}` : error);
  process.exit(1);
});
