import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenRouterClient } from "../llm/openrouter/client";
import { BudgetExceededError, Meter, type MeterStats } from "../llm/openrouter/meter";
import { buildProfileRuntime, loadProfile, withStoryModel, type Profile } from "../llm/profiles";
import { FIXTURES_DIR, manifestPath, type FixturesManifest } from "../llm/runtime";
import { DISCREPANCY_FIELDS, type Discrepancy, type Metric } from "./evaluate";
import { formatValue } from "./render";
import { runEvaluation } from "./run-eval";

export const DEFAULT_PROFILES = ["A", "B", "C"];
export const DEFAULT_BUDGET_USD = 5;

export type ProfileStatus = "termine" | "budget_atteint" | "erreur" | "non_lance";

export interface ProfileResult {
  profile: string;
  description: string;
  steps: Profile["steps"];
  decisions: Profile["decisions"];
  storyModelOverride: string | null;
  status: ProfileStatus;
  error: string | null;
  lastStage: string | null;
  durationMs: number;
  stats: MeterStats | null;
  metrics: Metric[];
  discrepancies: Discrepancy[];
  fixturesRecorded: boolean;
}

export interface CompareOptions {
  root: string;
  profiles: string[];
  budgetUsd: number;
  storyModel: string | null;
  recordFixtures: string | null;
  outDir: string;
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  retry?: { attempts: number; delayMs: number };
  generationLookup?: { attempts: number; delayMs: number };
  log?: (line: string) => void;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

/** Dernier garde-fou avant de remplacer les fixtures : aucune trace de clé ni d'en-tête d'autorisation. */
export function assertNoSecrets(dir: string, apiKey: string): void {
  for (const file of filesUnder(dir)) {
    const text = readFileSync(file, "utf8");
    if ((apiKey && text.includes(apiKey)) || /authorization|bearer\s/i.test(text)) {
      throw new Error(`Secret ou en-tête d'autorisation trouvé dans ${file} : fixtures non remplacées.`);
    }
  }
}

function installFixtures(root: string, tmpDir: string, profile: Profile, apiKey: string): void {
  assertNoSecrets(tmpDir, apiKey);
  const manifest: FixturesManifest = {
    profile: profile.name,
    origin: "enregistree",
    steps: profile.steps,
    decisionGroups: [],
    decisionEngines: {},
  };
  const groups = new Map<string, FixturesManifest["decisionGroups"][number]>();
  for (const [step, spec] of Object.entries(profile.decisions) as [keyof Profile["decisions"], Profile["decisions"][keyof Profile["decisions"]]][]) {
    if (spec.engine === "inline") continue;
    const k = JSON.stringify(spec);
    groups.set(k, [...(groups.get(k) ?? []), step]);
    manifest.decisionEngines[step] = spec.engine === "decisions" ? `${spec.model}${spec.fallback ? ` (repli ${spec.fallback})` : ""}` : spec.model;
  }
  manifest.decisionGroups = [...groups.values()];
  writeFileSync(manifestPath(tmpDir), `${JSON.stringify(manifest, null, 2)}\n`);
  const target = path.join(root, FIXTURES_DIR);
  rmSync(target, { recursive: true, force: true });
  renameSync(tmpDir, target);
}

export async function runCompare(options: CompareOptions): Promise<ProfileResult[]> {
  const log = options.log ?? (() => {});
  mkdirSync(options.outDir, { recursive: true });
  const rootMeter = new Meter({ budgetUsd: options.budgetUsd });
  const baseClient = new OpenRouterClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    meter: rootMeter,
    rawLogFile: path.join(options.outDir, "raw-responses.jsonl"),
    retry: options.retry,
    generationLookup: options.generationLookup,
  });

  const results: ProfileResult[] = [];
  let stop = false;
  for (const name of options.profiles) {
    const profile = withStoryModel(loadProfile(options.root, name), options.storyModel);
    const base: ProfileResult = {
      profile: profile.name,
      description: profile.description,
      steps: profile.steps,
      decisions: profile.decisions,
      storyModelOverride: options.storyModel,
      status: "non_lance",
      error: null,
      lastStage: null,
      durationMs: 0,
      stats: null,
      metrics: [],
      discrepancies: [],
      fixturesRecorded: false,
    };
    if (stop) {
      results.push(base);
      writeFileSync(path.join(options.outDir, `${profile.name}.json`), `${JSON.stringify(base, null, 2)}\n`);
      continue;
    }

    log(`Profil ${profile.name} : ${profile.description}`);
    const meter = new Meter({ parent: rootMeter });
    const client = baseClient.withMeter(meter);
    const recording = options.recordFixtures === profile.name;
    const tmpDir = path.join(options.outDir, `fixtures-${profile.name}.tmp`);
    if (recording) rmSync(tmpDir, { recursive: true, force: true });
    const started = performance.now();
    const result: ProfileResult = { ...base };
    try {
      const run = await runEvaluation({
        root: options.root,
        runtime: buildProfileRuntime(profile, client),
        recording: recording ? buildProfileRuntime(profile, client, { recordDir: tmpDir }) : undefined,
        withHoldout: true,
        onStage: (stage) => {
          result.lastStage = stage;
          log(`  ${stage}…`);
        },
      });
      result.status = "termine";
      result.metrics = run.report.metrics;
      result.discrepancies = run.report.discrepancies;
      if (recording) {
        installFixtures(options.root, tmpDir, profile, options.apiKey);
        result.fixturesRecorded = true;
        log(`  fixtures du mode sans clé remplacées par les sorties du profil ${profile.name}.`);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      if (error instanceof BudgetExceededError) {
        result.status = "budget_atteint";
        stop = true;
      } else {
        result.status = "erreur";
      }
      log(`  ${result.status} : ${result.error}`);
    } finally {
      if (recording) rmSync(tmpDir, { recursive: true, force: true });
    }
    result.durationMs = Math.round(performance.now() - started);
    result.stats = meter.stats();
    results.push(result);
    writeFileSync(path.join(options.outDir, `${profile.name}.json`), `${JSON.stringify(result, null, 2)}\n`);
  }

  writeFileSync(path.join(options.outDir, "summary.md"), renderSummary(results, options, rootMeter.stats()));
  return results;
}

const STATUS_LABEL: Record<ProfileStatus, string> = {
  termine: "terminé",
  budget_atteint: "arrêté : budget atteint",
  erreur: "erreur",
  non_lance: "non lancé",
};

const ms = (v: number | null) => (v === null ? "n/a" : `${Math.round(v)} ms`);
const pctOrNa = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)} %`);

export function renderSummary(results: ProfileResult[], options: Pick<CompareOptions, "budgetUsd" | "storyModel" | "recordFixtures">, total: MeterStats): string {
  const names = results.map((r) => r.profile);
  const lines = [
    "# Comparaison de profils sur OpenRouter",
    "",
    `Budget : ${total.costUsd.toFixed(4)} $ dépensés sur ${options.budgetUsd.toFixed(2)} $.${total.costUnknownCalls ? ` ${total.costUnknownCalls} appel(s) sans coût connu : la dépense réelle est au moins celle-ci.` : ""}`,
    options.storyModel ? `Story rédigée par ${options.storyModel} pour tous les profils.` : "",
    options.recordFixtures ? `Fixtures enregistrées depuis le profil ${options.recordFixtures} : ${results.find((r) => r.profile === options.recordFixtures)?.fixturesRecorded ? "oui" : "non (profil incomplet)"}.` : "",
    "",
    "## Profils",
    "",
    ...results.map((r) => `- **${r.profile}** (${STATUS_LABEL[r.status]}${r.error ? ` : ${r.error}` : ""}) : ${r.description}`),
    "",
    "## Coût, latence, robustesse",
    "",
    `| Mesure | ${names.join(" | ")} |`,
    `| --- | ${names.map(() => "---").join(" | ")} |`,
  ];
  const row = (label: string, f: (s: MeterStats) => string) =>
    lines.push(`| ${label} | ${results.map((r) => (r.stats ? f(r.stats) : "—")).join(" | ")} |`);
  row("appels (chat + décision)", (s) => `${s.calls} (${s.chatCalls} + ${s.decisionCalls})`);
  row("coût", (s) => `${s.costUsd.toFixed(4)} $${s.costUnknownCalls ? ` (+${s.costUnknownCalls} inconnus)` : ""}`);
  row("latence moyenne", (s) => ms(s.latencyMeanMs));
  row("latence p95", (s) => ms(s.latencyP95Ms));
  row("taux d'erreurs de schéma", (s) => `${pctOrNa(s.schemaErrorRate)} (${s.schemaErrors})`);
  row("erreurs HTTP", (s) => String(s.httpErrors));
  row("réponses de décision illisibles", (s) => String(s.decisionParseErrors));
  row("replis sur le LLM", (s) => String(s.fallbacks));
  lines.push(`| durée | ${results.map((r) => (r.status === "non_lance" ? "—" : `${(r.durationMs / 1000).toFixed(1)} s`)).join(" | ")} |`);

  const done = results.filter((r) => r.status === "termine");
  if (done.length > 0) {
    lines.push("", "## Métriques (mêmes définitions que pnpm eval)", "", `| Mesure | ${done.map((r) => r.profile).join(" | ")} |`, `| --- | ${done.map(() => "---").join(" | ")} |`);
    for (const m of done[0]!.metrics) {
      const cells = done.map((r) => {
        const found = r.metrics.find((x) => x.section === m.section && x.name === m.name);
        return found ? formatValue(found.value) : "—";
      });
      lines.push(`| ${m.section} · ${m.name} | ${cells.join(" | ")} |`);
    }

    lines.push("", "## Écarts avec la clé, par feedback", "", "« ✓ » : conforme à la clé. Seuls les feedbacks où au moins un profil s'écarte sont listés.", "");
    lines.push(`| Feedback | Champ | Attendu | ${done.map((r) => r.profile).join(" | ")} |`, `| --- | --- | --- | ${done.map(() => "---").join(" | ")} |`);
    const keys = new Map<string, { feedbackId: string; field: Discrepancy["field"]; expected: string }>();
    for (const r of done) for (const d of r.discrepancies) keys.set(`${d.feedbackId}|${d.field}`, d);
    const sorted = [...keys.values()].sort(
      (a, b) => a.feedbackId.localeCompare(b.feedbackId) || DISCREPANCY_FIELDS.indexOf(a.field) - DISCREPANCY_FIELDS.indexOf(b.field),
    );
    if (sorted.length === 0) lines.push("| — | — | — | aucun écart |");
    for (const k of sorted) {
      const cells = done.map((r) => r.discrepancies.find((d) => d.feedbackId === k.feedbackId && d.field === k.field)?.got ?? "✓");
      lines.push(`| ${k.feedbackId} | ${k.field} | ${k.expected} | ${cells.join(" | ")} |`);
    }
  }
  lines.push(
    "",
    "Notes : le coût vient de `usage.cost` ou, à défaut, de `GET /api/v1/generation`. Le plafond est vérifié avant chaque appel ; les appels déjà partis (jusqu'à 4 en parallèle) peuvent le dépasser légèrement. La clé de réponses a été lue par le modèle qui a écrit les prompts.",
    "",
  );
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
