import type { LinearTeamLabel } from "@/core/sink/linear-status";

export type { LinearTeamLabel };

export interface ExportMode {
  mode: "linear" | "markdown";
  connected: boolean;
  source: "session" | "default" | "aucune";
  team: LinearTeamLabel | null;
  /** Identifiants de la connexion active, pour le garde-fou. Jamais la clé. */
  scope: { workspaceId: string; teamId: string } | null;
}

export function formatTeamLabel(team: LinearTeamLabel | null): string | null {
  if (!team) return null;
  return team.name ? `${team.key} · ${team.name}` : team.key;
}
