import { readFileSync } from "node:fs";
import path from "node:path";
import type { RunResult } from "../pipeline/run";
import type { AuthorMatch, FeedbackClassification, MaskedFeedback } from "../schemas";
import { screenForInjection } from "../security/injection";
import { needsInvestigation } from "../steps/classify";
import { matchThemes, moscowFromLabel, ratio, setScores, type Ratio } from "./metrics";

export interface KeyFeedback {
  id: string;
  lot: string;
  type: string;
  themes: string[];
  identification: string;
  injection: string | null;
  severite: string | null;
  doublon_backlog: string | null;
  rattachement_backlog: string | null;
}

export interface AnswerKey {
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

export function loadAnswerKey(root: string): AnswerKey {
  return JSON.parse(readFileSync(path.join(root, "data/answer-key.json"), "utf8")) as AnswerKey;
}

export interface Metric {
  section: string;
  name: string;
  value: Ratio | number | string;
  detail: string;
}

export const DISCREPANCY_FIELDS = ["type", "gravité", "injection", "flou", "thème", "issue backlog", "identification"] as const;
export type DiscrepancyField = (typeof DISCREPANCY_FIELDS)[number];

export interface Discrepancy {
  feedbackId: string;
  field: DiscrepancyField;
  expected: string;
  got: string;
}

export interface EvalReport {
  metrics: Metric[];
  discrepancies: Discrepancy[];
}

/** Ce que le holdout permet d'évaluer sans appel LLM. */
export interface HoldoutDeterministic {
  feedbacks: MaskedFeedback[];
  matches: AuthorMatch[];
}

export interface EvaluateInput {
  key: AnswerKey;
  lundi: RunResult;
  jeudi: RunResult;
  /** Lot holdout passé dans le pipeline après jeudi (mode réel uniquement). */
  holdout: RunResult | null;
  holdoutDeterministic: HoldoutDeterministic;
  prompts: string[];
}

export function evaluate(input: EvaluateInput): EvalReport {
  const { key } = input;
  const metrics: Metric[] = [];
  const add = (section: string, name: string, value: Metric["value"], detail = "") =>
    metrics.push({ section, name, value, detail });

  const batchSection = (run: RunResult, lots: ("lundi" | "jeudi")[], section: string) => {
    const { state } = run;
    const scope = Object.values(key.feedbacks).filter((f) => lots.includes(f.lot as "lundi" | "jeudi"));
    const scopeIds = new Set(scope.map((f) => f.id));
    const cls = new Map(state.classifications.map((c) => [c.feedbackId, c]));

    const typeKo = scope.filter((f) => cls.get(f.id)?.type !== f.type);
    add(section, "types", ratio(scope.length - typeKo.length, scope.length), typeKo.map((f) => `${f.id} : ${cls.get(f.id)?.type} au lieu de ${f.type}`).join(" ; "));

    const inj = setScores(
      state.classifications.filter((c) => c.injection.quarantined).map((c) => c.feedbackId),
      key.injections.filter((id) => scopeIds.has(id)),
    );
    add(section, "injections (rappel)", inj.recall, inj.falseNegatives.join(", "));
    add(section, "injections (précision)", inj.precision, inj.falsePositives.join(", "));

    const noise = key.bruit.filter((id) => scopeIds.has(id));
    add(section, "bruit écarté (hors_sujet)", ratio(noise.filter((id) => cls.get(id)?.type === "hors_sujet").length, noise.length));

    const vague = setScores(
      state.classifications.filter(needsInvestigation).map((c) => c.feedbackId),
      key.flous.filter((id) => scopeIds.has(id)),
    );
    add(section, "cas flous envoyés en investigation", vague.recall, vague.falsePositives.length ? `faux positifs : ${vague.falsePositives.join(", ")}` : "");

    const expectedThemes = Object.fromEntries(
      Object.entries(key.themes_vers_feedbacks)
        .map(([k, v]) => [k, lots.flatMap((l) => v[l])] as const)
        .filter(([, ids]) => ids.length > 0),
    );
    const foundThemes = Object.fromEntries(state.themes.map((t) => [t.key, t.feedbackIds]));
    const { matches, unmatchedFound } = matchThemes(expectedThemes, foundThemes);
    const matched = matches.filter((m) => m.found);
    add(section, "thèmes retrouvés (Jaccard ≥ 0,5)", ratio(matched.length, matches.length), matches.filter((m) => !m.found).map((m) => `manquant : ${m.expected}`).join(" ; "));
    add(section, "thèmes produits qui correspondent à un thème attendu", ratio(matched.length, Object.keys(foundThemes).length), unmatchedFound.map((f) => `en trop : ${f}`).join(" ; "));
    const meanJ = matched.reduce((s, m) => s + m.score, 0) / Math.max(1, matched.length);
    add(section, "Jaccard moyen des thèmes appariés", Number(meanJ.toFixed(2)));

    const foundOf = new Map(matched.map((m) => [m.expected, m.found!]));
    const decision = new Map(state.allocation.decisions.map((d) => [d.themeKey, d.moscow]));
    const theme = new Map(state.themes.map((t) => [t.key, t]));
    const batch = lots.at(-1)!;
    const expectedClass = (k: string) =>
      moscowFromLabel(key.themes[k]![batch].classe) ?? (batch === "jeudi" ? moscowFromLabel(key.themes[k]!.lundi.classe) : null);
    const classed = Object.keys(expectedThemes).filter((k) => expectedClass(k) !== null);
    const classOk = classed.filter((k) => foundOf.has(k) && decision.get(foundOf.get(k)!) === expectedClass(k));
    add(
      section,
      "classe MoSCoW par thème",
      ratio(classOk.length, classed.length),
      classed
        .filter((k) => !classOk.includes(k))
        .map((k) => `${k} : ${foundOf.has(k) ? decision.get(foundOf.get(k)!) : "thème absent"} au lieu de ${expectedClass(k)}`)
        .join(" ; "),
    );
    const expectedMust = classed.filter((k) => expectedClass(k) === "Must");
    const must = setScores(
      state.allocation.decisions.filter((d) => d.moscow === "Must").map((d) => d.themeKey),
      expectedMust.map((k) => foundOf.get(k) ?? `(absent) ${k}`),
    );
    add(section, "Must attendus présents", must.recall);
    add(section, "Must sans faux positif", must.precision, must.falsePositives.join(", "));

    const withIssue = Object.keys(expectedThemes).filter((k) => key.themes[k]!.issue);
    const issueOk = withIssue.filter((k) => foundOf.has(k) && theme.get(foundOf.get(k)!)?.backlogIssueId === key.themes[k]!.issue);
    add(section, "thème rattaché à la bonne issue du backlog", ratio(issueOk.length, withIssue.length), withIssue.filter((k) => !issueOk.includes(k)).join(", "));

    const strict = Object.entries(key.doublons_backlog_stricts).flatMap(([issue, ids]) =>
      ids.filter((id) => scopeIds.has(id)).map((id) => ({ id, issue })),
    );
    const strictOk = strict.filter(({ id, issue }) => state.themes.some((t) => t.feedbackIds.includes(id) && t.backlogIssueId === issue));
    add(section, "doublons stricts du backlog détectés", ratio(strictOk.length, strict.length));

    const fresh = new Set(run.newFeedbackIds);
    const scopedMatches = state.matches.filter((m) => fresh.has(m.feedbackId));
    const idOk = scopedMatches.filter((m) => key.feedbacks[m.feedbackId]?.identification === m.confidence);
    add(section, "rapprochement auteur-compte", ratio(idOk.length, scopedMatches.length));
    return { foundOf, decision };
  };

  const l = batchSection(input.lundi, ["lundi"], "Lot lundi");
  const j = batchSection(input.jeudi, ["lundi", "jeudi"], "Lot jeudi (cumulé avec lundi)");
  const moves = key.mouvements_jeudi.filter((m) => moscowFromLabel(m.classe_lundi) && moscowFromLabel(m.classe_jeudi));
  const movesOk = moves.filter((m) => {
    const fl = l.foundOf.get(m.theme);
    const fj = j.foundOf.get(m.theme);
    return fl && fj && l.decision.get(fl) === moscowFromLabel(m.classe_lundi) && j.decision.get(fj) === moscowFromLabel(m.classe_jeudi);
  });
  add("Lot jeudi (cumulé avec lundi)", "mouvements lundi → jeudi conformes", ratio(movesOk.length, moves.length));

  const all = input.prompts.join("\n");
  const leaks = (all.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).length + (all.match(/0[1-9](?:[ .]?\d{2}){4}/g) ?? []).length;
  add("Données personnelles", "prompts sans e-mail ni téléphone", ratio(leaks === 0 ? 1 : 0, 1), `${input.prompts.length} prompts inspectés`);
  const masked = key.donnees_personnelles.filter((id) => {
    const f = input.jeudi.state.feedbacks.find((x) => x.id === id);
    return f && f.pii.some((p) => p.kind === "telephone") && f.pii.some((p) => p.kind === "adresse");
  });
  add("Données personnelles", "feedbacks avec téléphone et adresse masqués", ratio(masked.length, key.donnees_personnelles.length), key.donnees_personnelles.join(", "));

  const H = "Holdout (10 feedbacks, jamais utilisés pour les fixtures)";
  const hd = input.holdoutDeterministic;
  const holdIds = new Set(hd.feedbacks.map((f) => f.id));
  const holdKey = Object.values(key.feedbacks).filter((f) => holdIds.has(f.id));
  const holdIdOk = hd.matches.filter((m) => key.feedbacks[m.feedbackId]?.identification === m.confidence);
  add(H, "rapprochement auteur-compte", ratio(holdIdOk.length, hd.matches.length));
  const heur = setScores(
    hd.feedbacks.filter((f) => screenForInjection(f.maskedText).signals.length > 0).map((f) => f.id),
    key.injections.filter((id) => holdIds.has(id)),
  );
  add(H, "injections, heuristique seule (rappel)", heur.recall, heur.falseNegatives.join(", "));
  add(H, "injections, heuristique seule (précision)", heur.precision, heur.falsePositives.join(", "));

  const foundToExpected = new Map([...j.foundOf].map(([e, f]) => [f, e]));
  if (input.holdout) {
    const hs = input.holdout.state;
    const cls = new Map(hs.classifications.map((c) => [c.feedbackId, c]));
    const typeKo = holdKey.filter((f) => cls.get(f.id)?.type !== f.type);
    add(H, "types", ratio(holdKey.length - typeKo.length, holdKey.length), typeKo.map((f) => `${f.id} : ${cls.get(f.id)?.type} au lieu de ${f.type}`).join(" ; "));
    const inj = setScores(
      holdKey.filter((f) => cls.get(f.id)?.injection.quarantined).map((f) => f.id),
      key.injections.filter((id) => holdIds.has(id)),
    );
    add(H, "injections, modèle + heuristique (rappel)", inj.recall, inj.falseNegatives.join(", "));
    add(H, "injections, modèle + heuristique (précision)", inj.precision, inj.falsePositives.join(", "));
    const vague = setScores(
      holdKey.filter((f) => cls.has(f.id) && needsInvestigation(cls.get(f.id)!)).map((f) => f.id),
      key.flous.filter((id) => holdIds.has(id)),
    );
    add(H, "cas flous envoyés en investigation", vague.recall, vague.falsePositives.length ? `faux positifs : ${vague.falsePositives.join(", ")}` : "");
    const withTheme = holdKey.filter((f) => f.themes.length > 0);
    const themeOk = withTheme.filter((f) => {
      const t = hs.themes.find((x) => x.feedbackIds.includes(f.id));
      return t && f.themes.includes(foundToExpected.get(t.key) ?? "");
    });
    add(H, "feedbacks rangés dans le bon thème", ratio(themeOk.length, withTheme.length), withTheme.filter((f) => !themeOk.includes(f)).map((f) => f.id).join(", "));
  } else {
    add(H, "types, thèmes, cas flous", "non évalué", "Couches LLM : relancer avec `pnpm eval --provider real` ou `pnpm eval:compare`.");
  }

  const discrepancies = [
    ...feedbackDiscrepancies(key, input.jeudi, foundToExpected, ["lundi", "jeudi"]),
    ...(input.holdout ? feedbackDiscrepancies(key, input.holdout, foundToExpected, ["holdout"]) : []),
  ];
  return { metrics, discrepancies };
}

function feedbackDiscrepancies(
  key: AnswerKey,
  run: RunResult,
  foundToExpected: ReadonlyMap<string, string>,
  lots: string[],
): Discrepancy[] {
  const { state } = run;
  const cls = new Map<string, FeedbackClassification>(state.classifications.map((c) => [c.feedbackId, c]));
  const matches = new Map(state.matches.map((m) => [m.feedbackId, m]));
  const out: Discrepancy[] = [];
  for (const f of Object.values(key.feedbacks).filter((x) => lots.includes(x.lot))) {
    const c = cls.get(f.id);
    if (!c) {
      out.push({ feedbackId: f.id, field: "type", expected: f.type, got: "non classé" });
      continue;
    }
    const push = (field: DiscrepancyField, expected: string, got: string) => {
      if (expected !== got) out.push({ feedbackId: f.id, field, expected, got });
    };
    push("type", f.type, c.type);
    if (f.severite) push("gravité", f.severite, c.severity ?? "aucune");
    push("injection", key.injections.includes(f.id) ? "oui" : "non", c.injection.quarantined ? "oui" : "non");
    push("flou", key.flous.includes(f.id) ? "oui" : "non", needsInvestigation(c) ? "oui" : "non");
    const theme = state.themes.find((t) => t.feedbackIds.includes(f.id));
    const gotTheme = theme ? (foundToExpected.get(theme.key) ?? `(non apparié) ${theme.key}`) : "aucun";
    const expectedTheme = f.themes[0] ?? "aucun";
    if (!(f.themes.length === 0 ? gotTheme === "aucun" : f.themes.includes(gotTheme))) {
      out.push({ feedbackId: f.id, field: "thème", expected: f.themes.join(" ou ") || expectedTheme, got: gotTheme });
    }
    const expectedIssue = f.rattachement_backlog ?? f.doublon_backlog;
    if (expectedIssue) push("issue backlog", expectedIssue, theme?.backlogIssueId ?? "aucune");
    const m = matches.get(f.id);
    if (m) push("identification", f.identification, m.confidence);
  }
  return out;
}
