import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildBacklogItems, type SinkResult } from "../sink/backlog-sink";
import { DryRunLinearApi } from "../sink/linear-dry-run";
import { SdkLinearApi } from "../sink/linear-api";
import { LinearSink } from "../sink/linear-sink";
import { feedbackUrlFor, replayDemo } from "../pipeline/replay-demo";

const ROOT = path.resolve(import.meta.dirname, "../..");

const USAGE = `Usage : pnpm export:linear --batch lundi|jeudi [options]

Exporte vers Linear les thèmes Must, Should et Could du lot (réponses LLM rejouées, aucun appel LLM).
Lit LINEAR_API_KEY et LINEAR_TEAM_ID (UUID ou clé d'équipe) dans l'environnement ou dans .env.

Options :
  --dry-run                 N'écrit rien : lit Linear et affiche ce qui serait créé ou mis à jour.
                            Sans LINEAR_API_KEY, simulation hors ligne (tout est supposé à créer).
  --theme <clé>             Limite l'export à ce thème (répétable).
  --no-customer-requests    Ne crée pas de demandes clients (Customer Requests).

Les arbitrages faits dans l'interface (effort, MoSCoW forcé) restent dans le navigateur : la CLI exporte
le classement de l'agent et les décisions de data/po-decisions.json. Pour exporter avec vos arbitrages,
utilisez le bouton « Valider et exporter vers Linear » de l'interface.`;

const WOULD = { cree: "serait créée", mis_a_jour: "serait mise à jour", inchange: "déjà à jour, rien à faire", bloque: "bloquée" } as const;
const DID = { cree: "créée", mis_a_jour: "mise à jour", inchange: "inchangée", bloque: "bloquée" } as const;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function printResult(r: SinkResult, title: string, dryRun: boolean) {
  const verb = (dryRun ? WOULD : DID)[r.action];
  const target = r.target && r.target !== "(à créer)" ? ` → ${r.target}` : "";
  console.log(`- ${title} : ${verb}${target}${r.url ? ` (${r.url})` : ""}`);
  if (r.reason) console.log(`    ${r.reason}`);
  for (const n of r.notes ?? []) console.log(`    ${dryRun ? n.replace("ajoutée(s)", "à ajouter") : n}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      batch: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      theme: { type: "string", multiple: true },
      "no-customer-requests": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (values.batch !== "lundi" && values.batch !== "jeudi") fail("--batch doit valoir lundi ou jeudi.");
  const dryRun = values["dry-run"];

  const envFile = path.join(ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  const teamRef = process.env.LINEAR_TEAM_ID?.trim();
  if (!teamRef) fail("LINEAR_TEAM_ID absent : renseignez l'UUID ou la clé de l'équipe Linear.");
  if (!apiKey && !dryRun) fail("LINEAR_API_KEY absent : l'export réel est impossible. Essayez --dry-run.");

  const sdk = apiKey ? SdkLinearApi.fromKey(apiKey) : null;
  if (sdk) {
    const team = await sdk.resolveTeam(teamRef);
    if (!team) fail(`Équipe Linear « ${teamRef} » introuvable avec cette clé.`);
    console.log(`Équipe Linear : ${team.key} · ${team.name} (${team.id})`);
  } else {
    console.log("LINEAR_API_KEY absent : simulation hors ligne, sans lecture de Linear.");
  }

  const result = (await replayDemo(ROOT))[values.batch];
  const feedbackUrl = feedbackUrlFor(values.batch);
  const items = buildBacklogItems(result, { feedbackUrl, themeKeys: values.theme });
  if (values.theme) {
    const missing = values.theme.filter((k) => !items.some((i) => i.themeKey === k));
    if (missing.length) console.log(`Ignoré(s), ni Must, ni Should, ni Could sur ce lot : ${missing.join(", ")}.`);
  }
  if (items.length === 0) {
    console.log("Rien à exporter.");
    return;
  }

  const dry = dryRun ? new DryRunLinearApi(sdk) : null;
  const sink = new LinearSink(dry ?? sdk!, {
    teamId: teamRef,
    feedbackUrl,
    customerRequests: !values["no-customer-requests"] && process.env.LINEAR_CUSTOMER_REQUESTS !== "0",
  });

  console.log(`\n${dryRun ? "Export à blanc" : "Export réel"} · lot ${values.batch} · ${items.length} thème(s)\n`);
  const results = await sink.push(items);
  results.forEach((r, i) => printResult(r, items[i]!.title, dryRun));

  if (dry) {
    console.log(`\nOpérations qui seraient envoyées à Linear (${dry.operations.length}) :`);
    for (const op of dry.operations) console.log(`  · ${op}`);
    console.log("\nAucune écriture effectuée. Relancez sans --dry-run pour exporter.");
  }
  if (feedbackUrl("x").includes("localhost")) {
    console.log("\nLes liens vers les feedbacks pointent sur http://localhost:43217 (ETAI_PUBLIC_URL pour les changer).");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
