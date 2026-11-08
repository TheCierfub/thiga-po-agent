import {
  arbitrablePoints,
  type Allocation,
  type ConstraintKind,
  type MoscowDecision,
  type Strategy,
} from "../schemas";

export interface AllocationItem {
  themeKey: string;
  points: number;
  rice: number;
  /** Départage à RICE égal : ARR des comptes touchés. */
  arr: number;
  confidence: number;
  strategyFit: "aligne" | "neutre" | "non_objectif";
  constraint: {
    kind: ConstraintKind;
    source: "llm" | "regle";
    confirmed: boolean;
    rejected: boolean;
    confirmationStale: boolean;
  } | null;
  /** Issue Linear déjà engagée dans le cycle (comptée dans la capacité engagée). */
  committedIssueId: string | null;
}

/** Un Should engage le cycle : il demande une preuve large (Confidence à 100 %). */
export const SHOULD_MIN_CONFIDENCE = 1;

const CONSTRAINT_LABEL: Record<ConstraintKind, string> = {
  contrat: "contrainte contractuelle",
  securite: "contrainte de sécurité",
  coeur_casse: "cœur du produit cassé",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

function byPriority(a: AllocationItem, b: AllocationItem): number {
  return b.rice - a.rice || b.arr - a.arr || a.themeKey.localeCompare(b.themeKey);
}

/**
 * MoSCoW façon DSDM.
 * 1. Must = contraintes confirmées par le PO, alerte au-delà de 60 % de la capacité arbitrable.
 * 2. Should, par RICE décroissant, si la preuve est large ; alerte au-delà de ~80 %.
 * 3. Could dans un budget de ~20 %, seulement si Must + Should laissent la contingence intacte.
 * 4. Le reste : Won't, avec la raison.
 */
export function allocateMoscow(items: AllocationItem[], strategy: Strategy): Allocation {
  const capacity = arbitrablePoints(strategy);
  const { mustAlertRatio, shouldLineRatio, couldBudgetRatio } = strategy.capacity;
  const shouldLine = shouldLineRatio * capacity;
  const couldBudget = couldBudgetRatio * capacity;

  const decisions: MoscowDecision[] = [];
  const alerts: Allocation["alerts"] = [];
  const pending: AllocationItem[] = [];
  let cumul = 0;

  const constraintOf = (item: AllocationItem): MoscowDecision["constraint"] =>
    item.constraint && !item.constraint.rejected
      ? {
          kind: item.constraint.kind,
          source: item.constraint.source,
          confirmed: item.constraint.confirmed,
          confirmationStale: item.constraint.confirmationStale,
        }
      : null;

  const decide = (item: AllocationItem, moscow: MoscowDecision["moscow"], reason: string, counted: boolean) => {
    if (counted) cumul += item.points;
    decisions.push({
      themeKey: item.themeKey,
      moscow,
      reason,
      points: item.points,
      cumulativePoints: counted ? cumul : null,
      constraint: constraintOf(item),
    });
  };

  for (const item of [...items].sort(byPriority)) {
    if (item.committedIssueId) {
      decide(item, "Hors arbitrage", `Déjà engagé dans le cycle (${item.committedIssueId}), compté dans la capacité engagée.`, false);
    } else if (item.constraint && !item.constraint.rejected && !item.constraint.confirmed) {
      decide(
        item,
        "À confirmer",
        `Must proposé (${CONSTRAINT_LABEL[item.constraint.kind]}). Le PO doit confirmer ; non compté dans la capacité tant que ce n'est pas fait.`,
        false,
      );
    } else {
      pending.push(item);
    }
  }

  const musts = pending.filter((i) => i.constraint?.confirmed && !i.constraint.rejected);
  for (const item of musts) {
    const stale = item.constraint?.confirmationStale
      ? " Preuves modifiées depuis la confirmation : à revoir avant export."
      : "";
    decide(item, "Must", `${CONSTRAINT_LABEL[item.constraint!.kind]}, confirmé par le PO.${stale}`, true);
  }
  const mustPoints = cumul;
  if (mustPoints > mustAlertRatio * capacity) {
    alerts.push({
      code: "MUST_AU_DELA_DE_60",
      message: `Les Must prennent ${fmt(mustPoints)} points sur ${fmt(capacity)} (${pct(mustPoints / capacity)}), au-delà du repère de ${pct(mustAlertRatio)}. Il reste peu de marge pour absorber un imprévu.`,
    });
  }
  if (mustPoints > capacity) {
    alerts.push({
      code: "MUST_AU_DELA_DE_LA_CAPACITE",
      message: `Les Must dépassent la capacité arbitrable (${fmt(mustPoints)} > ${fmt(capacity)}). Le cycle ne tient pas sans arbitrage.`,
    });
  }

  const rest = pending.filter((i) => !musts.includes(i));
  const shouldCandidates: AllocationItem[] = [];
  const couldCandidates: AllocationItem[] = [];
  for (const item of rest) {
    if (item.strategyFit === "non_objectif") {
      decide(item, "Won't", "Hors stratégie : non-objectif du trimestre.", false);
    } else if (item.confidence >= SHOULD_MIN_CONFIDENCE) {
      shouldCandidates.push(item);
    } else {
      couldCandidates.push(item);
    }
  }

  let shouldPoints = 0;
  for (const item of shouldCandidates) {
    if (cumul + item.points <= capacity) {
      shouldPoints += item.points;
      decide(item, "Should", `RICE ${fmt(item.rice)}, preuve large (Confidence 100 %).`, true);
    } else {
      decide(item, "Won't", `Capacité atteinte : ${fmt(cumul)} + ${fmt(item.points)} > ${fmt(capacity)} points.`, false);
    }
  }
  if (cumul > shouldLine) {
    alerts.push({
      code: "SHOULD_AU_DELA_DE_80",
      message: `Must + Should = ${fmt(cumul)} points sur ${fmt(capacity)} (${pct(cumul / capacity)}), au-delà du repère d'environ ${pct(shouldLineRatio)}. Arbitrage du PO : accepter le dépassement ou sortir un Should.`,
    });
  }

  let couldPoints = 0;
  const contingencyEaten = cumul > shouldLine;
  for (const item of couldCandidates) {
    if (contingencyEaten) {
      decide(item, "Won't", `Must + Should dépassent déjà ~${pct(shouldLineRatio)} : la contingence des Could est entamée.`, false);
    } else if (couldPoints + item.points <= couldBudget && cumul + item.points <= capacity) {
      couldPoints += item.points;
      decide(item, "Could", `RICE ${fmt(item.rice)}, preuve encore étroite (Confidence ${pct(item.confidence)}) : pas assez pour un Should.`, true);
    } else {
      decide(
        item,
        "Won't",
        `Budget Could atteint : ${fmt(couldPoints)} + ${fmt(item.points)} > ${fmt(couldBudget)} points (~${pct(couldBudgetRatio)}). Thème conservé pour un prochain cycle.`,
        false,
      );
    }
  }

  return { arbitrablePoints: capacity, mustPoints, shouldPoints, couldPoints, decisions, alerts };
}
