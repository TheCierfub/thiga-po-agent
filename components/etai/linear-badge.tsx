import { linearBadgeLabel, type LinearBadgeTeam } from "@/core/linear/badge";

/** Libellé court du badge. Le nom vient de l'équipe passée, jamais d'une constante. */
export function LinearHeaderBadge({ team }: { team: LinearBadgeTeam | null }) {
  return <span className="truncate">{linearBadgeLabel(team)}</span>;
}
