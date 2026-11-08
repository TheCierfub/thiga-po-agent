import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createProvider } from "../cli/run-command";
import { renderMetrics } from "./render";
import { runEvaluation } from "./run-eval";

const ROOT = path.resolve(import.meta.dirname, "../..");

async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: "string", default: "replay" },
      profile: { type: "string" },
      budget: { type: "string", default: "5" },
      "allow-stale-fixtures": { type: "boolean", default: false },
    },
  });
  if (values.provider !== "replay" && values.provider !== "real") throw new Error("--provider doit valoir replay ou real.");
  const envFile = path.join(ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const setup = createProvider({
    root: ROOT,
    provider: values.provider,
    record: false,
    allowStaleFixtures: values["allow-stale-fixtures"],
    profile: values.profile ?? null,
    budgetUsd: Number(values.budget),
  });
  const real = values.provider === "real";
  const { report } = await runEvaluation({ root: ROOT, runtime: setup, withHoldout: real });

  const lines = [`# Évaluation · fournisseur ${setup.provider.name}`, ""];
  if (!real) {
    const origin = setup.replay && new Set(setup.replay.origins.values()).has("enregistree") ? "enregistrées depuis un modèle réel" : null;
    lines.push(
      origin
        ? `Mode rejoué : réponses LLM ${origin} (voir fixtures/llm/manifest.json). Le holdout n'est évalué que sur les couches déterministes.`
        : "Lecture honnête : en mode rejoué, les réponses LLM des lots lundi et jeudi sont des fixtures rédigées à la main par le modèle qui a codé la phase 1, après lecture de la clé. Les scores de type et de thème mesurent donc la plomberie (schémas, citations, quarantaine, règles RICE et MoSCoW), pas la qualité d'un modèle. Le holdout n'est évalué que sur les couches déterministes.",
    );
  }
  lines.push(...renderMetrics(report), "", "Les règles heuristiques d'injection ont été écrites après lecture des trois lots, holdout compris : le holdout n'est pas aveugle pour elles.");
  if (setup.meter) {
    const s = setup.meter.stats();
    lines.push("", `OpenRouter : ${s.calls} appels, ${s.costUsd.toFixed(4)} $, ${s.schemaErrors} réponse(s) hors schéma.`);
  }
  console.log(lines.join("\n"));

  const dir = path.join(ROOT, "out/eval");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "rapport.md"), `${lines.join("\n")}\n`);
  writeFileSync(path.join(dir, "resultats.json"), `${JSON.stringify({ provider: setup.provider.name, ...report }, null, 2)}\n`);
  console.log(`\nRapport écrit dans ${path.relative(ROOT, path.join(dir, "rapport.md"))}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `Erreur : ${error.message}` : error);
  process.exit(1);
});
