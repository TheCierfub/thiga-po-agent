import { z } from "zod";
import type { RunState } from "../pipeline/state";
import { SizeSchema, arbitrablePoints, type Allocation, type MoscowDecision, type RiceScore, type Strategy } from "../schemas";
import { allocateMoscow, capacityAlerts, type AllocationItem } from "./moscow";
import { computeRice } from "./rice";

export const FORCEABLE_CLASSES = ["Must", "Should", "Could", "Won't"] as const;
export type ForceableClass = (typeof FORCEABLE_CLASSES)[number];

/** Arbitrages du PO dans l'interface : ils ne touchent ni aux preuves ni aux évaluations du LLM. */
export const PoOverridesSchema = z.object({
  effort: z.record(z.string(), SizeSchema),
  forced: z.record(
    z.string(),
    z.object({ moscow: z.enum(FORCEABLE_CLASSES), motif: z.string().max(500) }),
  ),
});
export type PoOverrides = z.infer<typeof PoOverridesSchema>;

export const NO_OVERRIDES: PoOverrides = { effort: {}, forced: {} };

export function hasOverrides(o: PoOverrides): boolean {
  return Object.keys(o.effort).length > 0 || Object.keys(o.forced).length > 0;
}

type Scoring = Pick<RunState, "themes" | "rice" | "assessments" | "allocation">;

const COUNTED: ForceableClass[] = ["Must", "Should", "Could"];

/**
 * Recalcule RICE et MoSCoW avec les arbitrages du PO.
 * - Effort modifié : RICE recalculé avec la nouvelle taille.
 * - Catégorie forcée : le thème la prend, avec le motif comme raison. S'il est compté (Must, Should,
 *   Could), ses points sont réservés avant d'allouer les autres thèmes ; les alertes de capacité portent
 *   sur la capacité entière.
 * Sans arbitrage, le résultat est celui du pipeline.
 */
export function reprioritize(scoring: Scoring, strategy: Strategy, overrides: PoOverrides): { rice: RiceScore[]; allocation: Allocation } {
  const rice = scoring.rice.map((r) => {
    const size = overrides.effort[r.themeKey];
    if (!size || size === r.effort.size) return r;
    return computeRice({
      themeKey: r.themeKey,
      reach: r.reach,
      confidence: r.confidence,
      impact: r.impact,
      effort: { size, source: "po" },
      strategy,
    });
  });
  if (!hasOverrides(overrides)) return { rice, allocation: scoring.allocation };

  const riceByKey = new Map(rice.map((r) => [r.themeKey, r]));
  const previous = new Map(scoring.allocation.decisions.map((d) => [d.themeKey, d]));
  const fitByKey = new Map(scoring.assessments.map((a) => [a.themeKey, a.strategyFit]));
  const items: AllocationItem[] = scoring.themes.map((t) => {
    const r = riceByKey.get(t.key)!;
    const d = previous.get(t.key);
    return {
      themeKey: t.key,
      points: r.effort.points,
      rice: r.score,
      arr: r.reach.arr,
      confidence: r.confidence.value,
      strategyFit: fitByKey.get(t.key) ?? "neutre",
      constraint: d?.constraint ? { ...d.constraint, rejected: false } : null,
      committedIssueId: d?.moscow === "Hors arbitrage" ? (t.backlogIssueId ?? "engagé") : null,
    };
  });

  const forcedItems = items.filter((i) => overrides.forced[i.themeKey]);
  const reserved = forcedItems
    .filter((i) => COUNTED.includes(overrides.forced[i.themeKey]!.moscow))
    .reduce((sum, i) => sum + i.points, 0);
  const capacity = arbitrablePoints(strategy);
  const remaining: Strategy = {
    ...strategy,
    capacity: { ...strategy.capacity, committedPoints: Math.min(strategy.capacity.committedPoints + reserved, strategy.capacity.grossPoints - 0.001) },
  };
  const rest = allocateMoscow(
    items.filter((i) => !overrides.forced[i.themeKey]),
    remaining,
  );

  const forcedDecisions: MoscowDecision[] = forcedItems.map((i) => {
    const f = overrides.forced[i.themeKey]!;
    return {
      themeKey: i.themeKey,
      moscow: f.moscow,
      reason: `Forcé par le PO : ${f.motif.trim() || "sans motif"}.`,
      points: i.points,
      cumulativePoints: null,
      constraint: previous.get(i.themeKey)?.constraint ?? null,
    };
  });
  const decisions = [...forcedDecisions, ...rest.decisions];
  const total = (c: ForceableClass) => decisions.filter((d) => d.moscow === c).reduce((sum, d) => sum + d.points, 0);
  const totals = { must: total("Must"), should: total("Should"), could: total("Could") };
  return {
    rice,
    allocation: {
      arbitrablePoints: capacity,
      mustPoints: totals.must,
      shouldPoints: totals.should,
      couldPoints: totals.could,
      decisions,
      alerts: capacityAlerts(totals, strategy),
    },
  };
}
