import type { Trend } from "../schemas";
import { weekIndex, type Window } from "./window";

export const TREND_RULE = {
  minLastWeek: 4,
  accelerationFactor: 2,
  minWeeksForRecurring: 3,
} as const;

const RULE_TEXT =
  `tendance : au moins ${TREND_RULE.minLastWeek} messages sur les 7 derniers jours ` +
  `et au moins ${TREND_RULE.accelerationFactor} fois la moyenne des 3 semaines d'avant ; ` +
  `récurrent : présent au moins ${TREND_RULE.minWeeksForRecurring} semaines sur 4 ; sinon ponctuel`;

/** Stock (récurrent) contre flux (tendance), calculé sur les dates de réception. */
export function computeTrend(dates: string[], window: Window): Trend {
  const weeklyCounts = [0, 0, 0, 0];
  for (const date of dates) {
    const i = weekIndex(date, window);
    if (i >= 0) weeklyCounts[i] = (weeklyCounts[i] ?? 0) + 1;
  }
  const [w1 = 0, w2 = 0, w3 = 0, w4 = 0] = weeklyCounts;
  const previousMean = (w1 + w2 + w3) / 3;
  const weeksPresent = weeklyCounts.filter((c) => c > 0).length;

  let kind: Trend["kind"] = "ponctuel";
  if (w4 >= TREND_RULE.minLastWeek && w4 >= TREND_RULE.accelerationFactor * previousMean) {
    kind = "tendance";
  } else if (weeksPresent >= TREND_RULE.minWeeksForRecurring) {
    kind = "recurrent";
  }
  return { kind, weeklyCounts, rule: RULE_TEXT };
}
