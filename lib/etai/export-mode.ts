import { connection } from "next/server";
import { activeLinearCredentials, readLinearSession } from "@/core/linear/connect";
import { SdkLinearApi } from "@/core/sink/linear-api";
import { memoryLinearStatusCache, resolveLinearStatus, type LinearTeamLabel } from "@/core/sink/linear-status";
import { currentLinearToken, readLinearCookieSecret } from "@/lib/etai/linear-cookie";
import type { ExportMode } from "@/lib/etai/export-mode-view";

export type { ExportMode, LinearTeamLabel } from "@/lib/etai/export-mode-view";
export { formatTeamLabel } from "@/lib/etai/export-mode-view";

const cache = memoryLinearStatusCache();

async function probeTeam(apiKey: string, teamId: string, signal: AbortSignal): Promise<LinearTeamLabel | null> {
  if (signal.aborted) throw new Error("aborted");
  const api = SdkLinearApi.fromKey(apiKey);
  const team = await api.resolveTeam(teamId);
  if (signal.aborted) throw new Error("aborted");
  if (!team) return null;
  try {
    const account = await api.inspectAccount();
    return {
      id: team.id,
      key: team.key,
      name: team.name,
      workspaceId: account.workspaceId,
      workspaceName: account.workspaceName,
      viewerName: account.viewerName,
    };
  } catch {
    return { id: team.id, key: team.key, name: team.name };
  }
}

/** Session du navigateur si elle existe, sinon la clé du serveur. La clé ne sort pas d'ici. */
export async function readExportMode(): Promise<ExportMode> {
  await connection();
  const session = readLinearSession(await currentLinearToken(), readLinearCookieSecret());
  const credentials = activeLinearCredentials(session, {
    apiKey: process.env.LINEAR_API_KEY,
    teamId: process.env.LINEAR_TEAM_ID,
  });
  if (!credentials) return { mode: "markdown", connected: false, source: "aucune", team: null, scope: null };
  const status = await resolveLinearStatus({
    apiKey: credentials.apiKey,
    teamId: credentials.teamId,
    now: Date.now(),
    cache,
    probe: probeTeam,
  });
  if (!status.connected) {
    return { mode: "markdown", connected: false, source: credentials.source, team: null, scope: null };
  }
  const team = session
    ? {
        ...status.team,
        id: status.team.id ?? session.teamId,
        workspaceId: status.team.workspaceId || session.workspaceId,
        workspaceName: status.team.workspaceName || session.workspaceName,
        ...(status.team.viewerName || session.viewerName ? { viewerName: status.team.viewerName || session.viewerName } : {}),
      }
    : status.team;
  const scope = team.workspaceId && team.id ? { workspaceId: team.workspaceId, teamId: team.id } : team.id ? { workspaceId: "", teamId: team.id } : null;
  return { mode: "linear", connected: true, source: credentials.source, team, scope };
}

/** Clé et équipe actives, côté serveur seulement. */
export async function activeLinearKey(): Promise<{ apiKey: string; teamId: string; workspaceId: string; workspaceName: string; teamName: string; teamKey: string } | null> {
  await connection();
  const session = readLinearSession(await currentLinearToken(), readLinearCookieSecret());
  const credentials = activeLinearCredentials(session, {
    apiKey: process.env.LINEAR_API_KEY,
    teamId: process.env.LINEAR_TEAM_ID,
  });
  if (!credentials) return null;
  if (session && credentials.source === "session") {
    return {
      apiKey: session.apiKey,
      teamId: session.teamId,
      workspaceId: session.workspaceId,
      workspaceName: session.workspaceName,
      teamName: session.teamName,
      teamKey: session.teamKey,
    };
  }
  const mode = await readExportMode();
  if (!mode.connected || !mode.team) return null;
  return {
    apiKey: credentials.apiKey,
    teamId: mode.team.id ?? credentials.teamId,
    workspaceId: mode.team.workspaceId ?? "",
    workspaceName: mode.team.workspaceName ?? "",
    teamName: mode.team.name,
    teamKey: mode.team.key,
  };
}
