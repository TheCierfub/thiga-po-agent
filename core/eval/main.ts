import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { z } from "zod";
import { createProvider } from "../cli/run-command";
import { loadBatchFile, loadContext, loadPoDecisions } from "../data/load";
import { buildIdentityIndex, matchAuthor } from "../identity/match";
import { ingestBatch } from "../ingest/connectors";
import type { LlmProvider, LlmRequest } from "../llm/provider";
import { runBatch, type RunResult } from "../pipeline/run";
import { maskFeedback } from "../privacy/mask";
import { screenForInjection } from "../security/injection";
import { classifyAll, needsInvestigation } from "../steps/classify";
import { formatRatio, matchThemes, moscowFromLabel, ratio, setScores, type Ratio } from "./metrics";

const ROOT = path.resolve(import.meta.dirname, "../..");

interface KeyFeedback {
  id: string;
  lot: string;
  type: string;
  themes: string[];
  identification: string;
  injection: string | null;
}
interface AnswerKey {
  themes: Record<string, { issue: string | null; lundi: { classe: string }; jeudi: { classe: string } }>;
  themes_vers_feedbacks: Record<string, { lundi: string[]; jeudi: string[]; holdout: string[] }>;
  mouvements_jeudi: { theme: string; classe_lundi: string; classe_jeudi: string }[];
  injections: string[];
  bruit: string[];
  doublons_backlog_stricts: Record<string, string[]>;
  flous: string[];
  donnees_personnelles: string[];
  feedbacks: Record<string, KeyFeedback>;
}

class SpyProvider implements LlmProvider {
  readonly name: string;
  readonly prompts: string[] = [];
  constructor(private readonly inner: LlmProvider) {
    this.name = inner.name;
  }
  async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    this.prompts.push(request.prompt);
    return this.inner.generate(request);
  }
}

const lines: string[] = [];
const results: Record<string, unknown> = {};
const out = (line = "") => {
  lines.push(line);
  console.log(line);
};
const metric = (name: string, value: Ratio, detail = "") => {
  results[name] = value;
  out(`| ${name} | ${formatRatio(value)} | ${detail} |`);
};
const table = () => {
  out("| Mesure | Résultat | Détail |");
  out("| --- | --- | --- |");
};

function inScope(key: AnswerKey, lots: string[]) {
  return Object.values(key.feedbacks).filter((f) => lots.includes(f.lot));
}

function evaluateBatch(key: AnswerKey, run: RunResult, lots: ("lundi" | "jeudi")[]) {
  const { state } = run;
  const scope = inScope(key, lots);
  const scopeIds = new Set(scope.map((f) => f.id));
  const cls = new Map(state.classifications.map((c) => [c.feedbackId, c]));

  const typeOk = scope.filter((f) => cls.get(f.id)?.type === f.type);
  metric(`${run.state.batch} · types`, ratio(typeOk.length, scope.length), scope.filter((f) => cls.get(f.id)?.type !== f.type).map((f) => `${f.id} : ${cls.get(f.id)?.type} au lieu de ${f.type}`).join(" ; "));

  const inj = setScores(
    state.classifications.filter((c) => c.injection.quarantined).map((c) => c.feedbackId),
    key.injections.filter((id) => scopeIds.has(id)),
  );
  metric(`${run.state.batch} · injections (rappel)`, inj.recall, inj.falseNegatives.join(", "));
  metric(`${run.state.batch} · injections (précision)`, inj.precision, inj.falsePositives.join(", "));

  const noise = key.bruit.filter((id) => scopeIds.has(id));
  const noiseOk = noise.filter((id) => cls.get(id)?.type === "hors_sujet");
  metric(`${run.state.batch} · bruit écarté (hors_sujet)`, ratio(noiseOk.length, noise.length));

  const vague = setScores(
    state.classifications.filter(needsInvestigation).map((c) => c.feedbackId),
    key.flous.filter((id) => scopeIds.has(id)),
  );
  metric(`${run.state.batch} · cas flous envoyés en investigation`, vague.recall, vague.falsePositives.length ? `faux positifs : ${vague.falsePositives.join(", ")}` : "");

  const expectedThemes = Object.fromEntries(
    Object.entries(key.themes_vers_feedbacks)
      .map(([k, v]) => [k, lots.flatMap((l) => v[l])] as const)
      .filter(([, ids]) => ids.length > 0),
  );
  const foundThemes = Object.fromEntries(state.themes.map((t) => [t.key, t.feedbackIds]));
  const { matches, unmatchedFound } = matchThemes(expectedThemes, foundThemes);
  const matched = matches.filter((m) => m.found);
  metric(
    `${run.state.batch} · thèmes retrouvés (Jaccard ≥ 0,5)`,
    ratio(matched.length, matches.length),
    matches.filter((m) => !m.found).map((m) => `manquant : ${m.expected}`).join(" ; "),
  );
  metric(
    `${run.state.batch} · thèmes produits qui correspondent à un thème attendu`,
    ratio(matched.length, Object.keys(foundThemes).length),
    unmatchedFound.map((f) => `en trop : ${f}`).join(" ; "),
  );
  const meanJ = matched.reduce((s, m) => s + m.score, 0) / Math.max(1, matched.length);
  results[`${run.state.batch} · Jaccard moyen`] = meanJ;
  out(`| ${run.state.batch} · Jaccard moyen des thèmes appariés | ${meanJ.toFixed(2)} | |`);

  const foundOf = new Map(matched.map((m) => [m.expected, m.found!]));
  const decision = new Map(state.allocation.decisions.map((d) => [d.themeKey, d.moscow]));
  const theme = new Map(state.themes.map((t) => [t.key, t]));

  const batch = lots.at(-1)!;
  const expectedClass = (k: string) => {
    const label = key.themes[k]![batch].classe;
    return moscowFromLabel(label) ?? (batch === "jeudi" ? moscowFromLabel(key.themes[k]!.lundi.classe) : null);
  };
  const classed = Object.keys(expectedThemes).filter((k) => expectedClass(k) !== null);
  const classOk = classed.filter((k) => foundOf.has(k) && decision.get(foundOf.get(k)!) === expectedClass(k));
  metric(
    `${run.state.batch} · classe MoSCoW par thème`,
    ratio(classOk.length, classed.length),
    classed.filter((k) => !classOk.includes(k)).map((k) => `${k} : ${foundOf.has(k) ? decision.get(foundOf.get(k)!) : "thème absent"} au lieu de ${expectedClass(k)}`).join(" ; "),
  );

  const expectedMust = classed.filter((k) => expectedClass(k) === "Must");
  const foundMust = state.allocation.decisions.filter((d) => d.moscow === "Must").map((d) => d.themeKey);
  const mustScores = setScores(foundMust, expectedMust.map((k) => foundOf.get(k) ?? `(absent) ${k}`));
  metric(`${run.state.batch} · Must attendus présents`, mustScores.recall);
  metric(`${run.state.batch} · Must sans faux positif`, mustScores.precision, mustScores.falsePositives.join(", "));

  const withIssue = Object.keys(expectedThemes).filter((k) => key.themes[k]!.issue);
  const issueOk = withIssue.filter((k) => foundOf.has(k) && theme.get(foundOf.get(k)!)?.backlogIssueId === key.themes[k]!.issue);
  metric(`${run.state.batch} · thème rattaché à la bonne issue du backlog`, ratio(issueOk.length, withIssue.length), withIssue.filter((k) => !issueOk.includes(k)).join(", "));

  const strict = Object.entries(key.doublons_backlog_stricts).flatMap(([issue, ids]) =>
    ids.filter((id) => scopeIds.has(id)).map((id) => ({ id, issue })),
  );
  const strictOk = strict.filter(({ id, issue }) => state.themes.some((t) => t.feedbackIds.includes(id) && t.backlogIssueId === issue));
  metric(`${run.state.batch} · doublons stricts du backlog détectés`, ratio(strictOk.length, strict.length));
  return { foundOf, decision };
}

function evaluateIdentity(key: AnswerKey, ids: Set<string>, matches: { feedbackId: string; confidence: string }[], label: string) {
  const scoped = matches.filter((m) => ids.has(m.feedbackId));
  const ok = scoped.filter((m) => key.feedbacks[m.feedbackId]?.identification === m.confidence);
  metric(
    `${label} · rapprochement auteur-compte`,
    ratio(ok.length, scoped.length),
    scoped.filter((m) => !ok.includes(m)).map((m) => `${m.feedbackId} : ${m.confidence} au lieu de ${key.feedbacks[m.feedbackId]?.identification}`).join(" ; "),
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: "string", default: "replay" },
      "allow-stale-fixtures": { type: "boolean", default: false },
    },
  });
  if (values.provider !== "replay" && values.provider !== "real") throw new Error("--provider doit valoir replay ou real.");
  const envFile = path.join(ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const key = JSON.parse(readFileSync(path.join(ROOT, "data/answer-key.json"), "utf8")) as AnswerKey;
  const { provider: inner } = createProvider({
    root: ROOT,
    provider: values.provider,
    record: false,
    allowStaleFixtures: values["allow-stale-fixtures"],
  });
  const provider = new SpyProvider(inner);
  const decisions = loadPoDecisions(ROOT, "data/po-decisions.json");

  out(`# Évaluation · fournisseur ${provider.name}`);
  out();
  if (values.provider === "replay") {
    out("Lecture honnête : en mode rejoué, les réponses LLM des lots lundi et jeudi sont des fixtures rédigées à la main par le modèle qui a codé la phase 1, après lecture de la clé. Les scores de type et de thème mesurent donc la plomberie (schémas, citations, quarantaine, règles RICE et MoSCoW), pas la qualité d'un modèle. Le holdout n'est évalué que sur les couches déterministes.");
    out();
  }

  const lundi = await runBatch({ root: ROOT, batch: "lundi", provider, reachMode: "comptes", decisions, previous: null });
  const jeudi = await runBatch({ root: ROOT, batch: "jeudi", provider, reachMode: "comptes", decisions, previous: lundi.state });

  out("## Lot lundi");
  out();
  table();
  const l = evaluateBatch(key, lundi, ["lundi"]);
  evaluateIdentity(key, new Set(lundi.newFeedbackIds), lundi.state.matches, "lundi");
  out();
  out("## Lot jeudi (cumulé avec lundi)");
  out();
  table();
  const j = evaluateBatch(key, jeudi, ["lundi", "jeudi"]);
  evaluateIdentity(key, new Set(jeudi.newFeedbackIds), jeudi.state.matches, "jeudi");

  const moves = key.mouvements_jeudi.filter((m) => moscowFromLabel(m.classe_lundi) && moscowFromLabel(m.classe_jeudi));
  const movesOk = moves.filter((m) => {
    const fl = l.foundOf.get(m.theme);
    const fj = j.foundOf.get(m.theme);
    return fl && fj && l.decision.get(fl) === moscowFromLabel(m.classe_lundi) && j.decision.get(fj) === moscowFromLabel(m.classe_jeudi);
  });
  metric("jeudi · mouvements lundi → jeudi conformes", ratio(movesOk.length, moves.length));
  out();

  out("## Données personnelles");
  out();
  table();
  const all = provider.prompts.join("\n");
  const leakedEmails = all.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  const leakedPhones = all.match(/0[1-9](?:[ .]?\d{2}){4}/g) ?? [];
  metric("prompts sans e-mail ni téléphone", ratio(leakedEmails.length + leakedPhones.length === 0 ? 1 : 0, 1), `${provider.prompts.length} prompts inspectés`);
  const piiFeedbacks = key.donnees_personnelles;
  const masked = piiFeedbacks.filter((id) => {
    const f = jeudi.state.feedbacks.find((x) => x.id === id);
    return f && f.pii.some((p) => p.kind === "telephone") && f.pii.some((p) => p.kind === "adresse");
  });
  metric("feedbacks avec téléphone et adresse masqués", ratio(masked.length, piiFeedbacks.length), piiFeedbacks.join(", "));
  out();

  out("## Holdout (10 feedbacks, jamais utilisés pour les fixtures)");
  out();
  table();
  const context = loadContext(ROOT);
  const holdout = ingestBatch(loadBatchFile(ROOT, "holdout")).map(maskFeedback);
  const holdIds = new Set(holdout.map((f) => f.id));
  const index = buildIdentityIndex(context.accounts);
  evaluateIdentity(key, holdIds, holdout.map((f) => matchAuthor(f, index)), "holdout");
  const heur = setScores(
    holdout.filter((f) => screenForInjection(f.maskedText).signals.length > 0).map((f) => f.id),
    key.injections.filter((id) => holdIds.has(id)),
  );
  metric("holdout · injections, heuristique seule (rappel)", heur.recall, heur.falseNegatives.join(", "));
  metric("holdout · injections, heuristique seule (précision)", heur.precision, heur.falsePositives.join(", "));

  if (values.provider === "real") {
    const cls = await classifyAll(holdout, provider, []);
    const byId = new Map(cls.map((c) => [c.feedbackId, c]));
    const scope = inScope(key, ["holdout"]);
    const ok = scope.filter((f) => byId.get(f.id)?.type === f.type);
    metric("holdout · types (LLM réel)", ratio(ok.length, scope.length), scope.filter((f) => !ok.includes(f)).map((f) => `${f.id} : ${byId.get(f.id)?.type} au lieu de ${f.type}`).join(" ; "));
    const inj = setScores(cls.filter((c) => c.injection.quarantined).map((c) => c.feedbackId), key.injections.filter((id) => holdIds.has(id)));
    metric("holdout · injections, LLM + heuristique (rappel)", inj.recall, inj.falseNegatives.join(", "));
    metric("holdout · injections, LLM + heuristique (précision)", inj.precision, inj.falsePositives.join(", "));
    const vague = setScores(cls.filter(needsInvestigation).map((c) => c.feedbackId), key.flous.filter((id) => holdIds.has(id)));
    metric("holdout · cas flous (LLM réel)", vague.recall, vague.falsePositives.join(", "));
  } else {
    out("| holdout · types, thèmes, cas flous | non évalué | Couches LLM : relancer avec `pnpm eval --provider real` et une clé dans .env. |");
  }
  out();
  out("Les règles heuristiques d'injection ont été écrites après lecture des trois lots, holdout compris : le holdout n'est pas aveugle pour elles.");

  const dir = path.join(ROOT, "out/eval");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "rapport.md"), `${lines.join("\n")}\n`);
  writeFileSync(path.join(dir, "resultats.json"), `${JSON.stringify({ provider: provider.name, results }, null, 2)}\n`);
  console.log(`\nRapport écrit dans ${path.relative(ROOT, path.join(dir, "rapport.md"))}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `Erreur : ${error.message}` : error);
  process.exit(1);
});
