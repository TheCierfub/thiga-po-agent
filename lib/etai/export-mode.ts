import { connection } from "next/server";
import { SdkLinearApi } from "@/core/sink/linear-api";
import {
  memoryLinearStatusCache,
  resolveLinearStatus,
  type LinearTeamLabel,
} from "@/core/sink/linear-status";

export type { LinearTeamLabel };

export interface ExportMode {
  mode: "linear" | "markdown";
  connected: boolean;
  team: LinearTeamLabel | null;
}

const cache = memoryLinearStatusCache();

export function formatTeamLabel(team: LinearTeamLabel | null): string | null {
  if (!team) return null;
  return team.name ? `${team.key} · ${team.name}` : team.key;
}

async function probeTeam(apiKey: string, teamId: string, signal: AbortSignal): Promise<LinearTeamLabel | null> {
  if (signal.aborted) throw new Error("aborted");
  const team = await SdkLinearApi.fromKey(apiKey).resolveTeam(teamId);
  if (signal.aborted) throw new Error("aborted");
  return team ? { key: team.key, name: team.name } : null;
}

/** Vrai seulement si Linear répond pour l'équipe configurée. La clé ne sort pas de cette fonction. */
export async function readExportMode(): Promise<ExportMode> {
  await connection();
  const status = await resolveLinearStatus({
    apiKey: process.env.LINEAR_API_KEY,
    teamId: process.env.LINEAR_TEAM_ID,
    now: Date.now(),
    cache,
    probe: probeTeam,
  });
  if (status.connected) return { mode: "linear", connected: true, team: status.team };
  return { mode: "markdown", connected: false, team: null };
}
