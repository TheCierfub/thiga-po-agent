import { hashOf } from "../util/hash";

export interface ThemeEvidence {
  key: string;
  feedbackIds: string[];
  relatedSignalIds: string[];
  backlogIssueId: string | null;
}

/** Empreinte des preuves d'un thème : toute dépendance aval s'y rattache. */
export function evidenceHash(theme: ThemeEvidence): string {
  return hashOf({
    feedbackIds: [...theme.feedbackIds].sort(),
    relatedSignalIds: [...theme.relatedSignalIds].sort(),
    backlogIssueId: theme.backlogIssueId,
  });
}

/** Hypothèses saisies par le PO ou le contexte ; un changement invalide le score et l'allocation. */
export function assumptionsHash(input: unknown): string {
  return hashOf(input);
}

export interface PreviousArtifacts {
  evidence: Record<string, string>;
  assumptions: Record<string, string>;
  /** themeKey → empreinte des preuves au moment de la rédaction. */
  stories: Record<string, string>;
  /** themeKey → empreinte des preuves au moment de la confirmation (lot de confirmation). */
  confirmations: Record<string, string>;
}

export interface InvalidationPlan {
  newThemes: string[];
  changedEvidence: string[];
  changedAssumptions: string[];
  unchanged: string[];
  /** Thèmes à réévaluer par le LLM (impact, effort, contrainte). */
  reassess: string[];
  /** Scores et allocation sont toujours recalculés : ils sont déterministes et bon marché. */
  recompute: "tous";
  staleStories: string[];
  staleConfirmations: string[];
}

export function planInvalidation(
  previous: PreviousArtifacts,
  nextEvidence: Record<string, string>,
  nextAssumptions: Record<string, string>,
): InvalidationPlan {
  const newThemes: string[] = [];
  const changedEvidence: string[] = [];
  const changedAssumptions: string[] = [];
  const unchanged: string[] = [];

  for (const key of Object.keys(nextEvidence).sort()) {
    if (!(key in previous.evidence)) newThemes.push(key);
    else if (previous.evidence[key] !== nextEvidence[key]) changedEvidence.push(key);
    else if (previous.assumptions[key] !== nextAssumptions[key]) changedAssumptions.push(key);
    else unchanged.push(key);
  }

  const staleStories = Object.entries(previous.stories)
    .filter(([key, hash]) => nextEvidence[key] !== hash || previous.assumptions[key] !== nextAssumptions[key])
    .map(([key]) => key)
    .sort();
  const staleConfirmations = Object.entries(previous.confirmations)
    .filter(([key, hash]) => nextEvidence[key] !== hash)
    .map(([key]) => key)
    .sort();

  return {
    newThemes,
    changedEvidence,
    changedAssumptions,
    unchanged,
    reassess: [...newThemes, ...changedEvidence].sort(),
    recompute: "tous",
    staleStories,
    staleConfirmations,
  };
}
