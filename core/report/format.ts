import type { Account, RiceScore, Trend } from "../schemas";

export function num(value: number, digits = 2): string {
  return Number(value.toFixed(digits)).toLocaleString("fr-FR");
}

export function pct(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export function accountNames(ids: readonly string[], accounts: ReadonlyMap<string, Account>): string {
  if (ids.length === 0) return "aucun";
  return ids.map((id) => accounts.get(id)?.nom ?? id).join(", ");
}

export function reachLabel(reach: RiceScore["reach"]): string {
  switch (reach.mode) {
    case "comptes":
      return `${reach.value} compte(s)`;
    case "volume":
      return `${reach.value} message(s)`;
    case "arr":
      return `${num(reach.value, 1)} k€ d'ARR`;
  }
}

export function trendLabel(trend: Trend): string {
  const label = { tendance: "Tendance", recurrent: "Récurrent", ponctuel: "Ponctuel" }[trend.kind];
  return `${label} (${trend.weeklyCounts.join("/")})`;
}

/** Une cellule de tableau markdown ne doit contenir ni barre verticale ni retour à la ligne. */
export function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll(/\s*\n\s*/g, " ");
}
