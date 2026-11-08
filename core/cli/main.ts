import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REACH_MODES, type MoscowClass, type ReachMode } from "../schemas";
import { num, pct } from "../report/format";
import { runCommand, type BatchOutput, type CliBatch } from "./run-command";

const ROOT = path.resolve(import.meta.dirname, "../..");

const USAGE = `Usage : pnpm agent run --batch lundi|jeudi [options]

Options :
  --provider replay|real     replay (défaut) : réponses enregistrées, sans clé ni réseau.
                             real : appel au fournisseur défini dans .env (LLM_PROVIDER, LLM_MODEL).
  --profile A|B|C|<fichier>  avec --provider real : OpenRouter, un modèle par étape (config/llm-profiles).
                             Sans profil : fournisseur unique défini par LLM_PROVIDER et LLM_MODEL.
  --budget <dollars>         Plafond de dépense OpenRouter (défaut : 5).
  --record                   avec --provider real sans profil, enregistre les réponses dans fixtures/llm.
  --reach comptes|volume|arr Mode de calcul du Reach (défaut : comptes).
  --decisions <fichier>      Décisions du PO (défaut : data/po-decisions.json).
  --out <dossier>            Dossier de sortie (défaut : out).
  --allow-stale-fixtures     Rejoue même si les données ont changé depuis l'enregistrement.

Le lot holdout est réservé à pnpm eval.`;

const ORDER: MoscowClass[] = ["Must", "Should", "Could", "À confirmer", "Hors arbitrage", "Won't"];
const ACTION_LABEL = { cree: "créé", mis_a_jour: "mis à jour", inchange: "inchangé", bloque: "bloqué" } as const;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function printSummary(output: BatchOutput) {
  const { state, changes } = output.result;
  const rice = new Map(state.rice.map((r) => [r.themeKey, r]));
  const titles = new Map(state.themes.map((t) => [t.key, t.title]));
  console.log(`\n== Lot ${state.batch} : ${output.result.newFeedbackIds.length} nouveaux feedbacks ==`);
  const rows = [...state.allocation.decisions].sort(
    (a, b) => ORDER.indexOf(a.moscow) - ORDER.indexOf(b.moscow) || rice.get(b.themeKey)!.score - rice.get(a.themeKey)!.score,
  );
  for (const d of rows) {
    const r = rice.get(d.themeKey)!;
    console.log(
      `  ${d.moscow.padEnd(14)} RICE ${num(r.score, 3).padStart(6)}  conf. ${pct(r.confidence.value).padStart(5)}  ${titles.get(d.themeKey)}`,
    );
  }
  for (const a of state.allocation.alerts) console.log(`  ! ${a.message}`);
  const quarantined = state.classifications.filter((c) => c.injection.quarantined).map((c) => c.feedbackId);
  if (quarantined.length > 0) console.log(`  Quarantaine : ${quarantined.join(", ")}`);
  for (const w of state.warnings) console.log(`  Avertissement : ${w}`);

  if (changes) {
    console.log(`\n  Changements depuis ${changes.previousBatch} :`);
    for (const t of changes.themes.filter((t) => t.moscowBefore !== t.moscowAfter)) {
      console.log(`  - ${t.title} : ${t.moscowBefore ?? "nouveau"} → ${t.moscowAfter}. ${t.reasonAfter}`);
    }
    for (const t of changes.themes.filter((t) => t.accountsRemoved.length > 0)) {
      console.log(`  - ${t.title} : ${t.accountsRemoved.length} compte(s) sorti(s) de la fenêtre.`);
    }
    if (changes.plan.staleConfirmations.length > 0) {
      console.log(`  - Confirmations du PO à revoir : ${changes.plan.staleConfirmations.join(", ")}.`);
    }
  }

  console.log("\n  Backlog local (out/backlog) :");
  for (const s of output.sink) {
    console.log(`  - ${s.stableKey} : ${ACTION_LABEL[s.action]}${s.reason ? ` (${s.reason})` : ""}`);
  }
  console.log("\n  Fichiers :");
  for (const f of output.files) console.log(`  - ${path.relative(ROOT, f)}`);
  for (const n of output.fixtureNotes) console.log(`\n  ${n}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      batch: { type: "string" },
      provider: { type: "string", default: "replay" },
      record: { type: "boolean", default: false },
      profile: { type: "string" },
      budget: { type: "string", default: "5" },
      reach: { type: "string", default: "comptes" },
      decisions: { type: "string", default: "data/po-decisions.json" },
      out: { type: "string", default: "out" },
      "allow-stale-fixtures": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (positionals[0] !== "run") fail("Commande inconnue.");
  if (values.batch === "holdout") fail("Le lot holdout est réservé à l'évaluation (pnpm eval).");
  if (values.batch !== "lundi" && values.batch !== "jeudi") fail("--batch doit valoir lundi ou jeudi.");
  if (values.provider !== "replay" && values.provider !== "real") fail("--provider doit valoir replay ou real.");
  if (values.record && values.provider !== "real") fail("--record n'a de sens qu'avec --provider real.");
  if (values.profile && values.provider !== "real") fail("--profile n'a de sens qu'avec --provider real.");
  const budgetUsd = Number(values.budget);
  if (!(budgetUsd > 0)) fail("--budget doit être un nombre positif.");
  if (!REACH_MODES.includes(values.reach as ReachMode)) fail(`--reach doit valoir ${REACH_MODES.join(", ")}.`);

  const envFile = path.join(ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const decisionsFile = existsSync(path.join(ROOT, values.decisions)) ? values.decisions : null;
  if (!decisionsFile) console.log(`Pas de fichier de décisions (${values.decisions}) : aucune contrainte confirmée.`);

  const outputs = await runCommand({
    root: ROOT,
    batch: values.batch as CliBatch,
    provider: values.provider,
    record: values.record,
    reachMode: values.reach as ReachMode,
    decisionsFile,
    outDir: path.resolve(ROOT, values.out),
    allowStaleFixtures: values["allow-stale-fixtures"],
    profile: values.profile ?? null,
    budgetUsd,
    log: (line) => console.log(line),
  });
  for (const o of outputs) printSummary(o);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `Erreur : ${error.message}` : error);
  process.exit(1);
});
