import { connection } from "next/server";
import { SdkLinearApi } from "@/core/sink/linear-api";

export interface LinearTeamLabel {
  key: string;
  name: string;
}

export interface ExportMode {
  mode: "linear" | "markdown";
  missing: string[];
  team: LinearTeamLabel | null;
}

const teamCache = new Map<string, LinearTeamLabel>();

export function formatTeamLabel(team: LinearTeamLabel | null): string | null {
  if (!team) return null;
  return team.name ? `${team.key} · ${team.name}` : team.key;
}

/** Lecture seule de l'équipe configurée. Un échec n'empêche pas l'écran : on affiche la clé telle qu'elle est écrite. */
async function lookupTeam(apiKey: string, teamId: string): Promise<LinearTeamLabel> {
  const cached = teamCache.get(teamId);
  if (cached) return cached;
  try {
    const team = await SdkLinearApi.fromKey(apiKey).resolveTeam(teamId);
    if (!team) return { key: teamId, name: "" };
    const label = { key: team.key, name: team.name };
    teamCache.set(teamId, label);
    return label;
  } catch {
    return { key: teamId, name: "" };
  }
}

/** Lit l'environnement à la requête : brancher Linear ne demande qu'un redémarrage, pas un rebuild. */
export async function readExportMode(): Promise<ExportMode> {
  await connection();
  const missing = ["LINEAR_API_KEY", "LINEAR_TEAM_ID"].filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) return { mode: "markdown", missing, team: null };
  const team = await lookupTeam(process.env.LINEAR_API_KEY!.trim(), process.env.LINEAR_TEAM_ID!.trim());
  return { mode: "linear", missing, team };
}
