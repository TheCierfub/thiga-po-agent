import { openJson, sealJson } from "./seal";

export const LINEAR_SESSION_COOKIE = "etai_linear_session";
export const LINEAR_PENDING_COOKIE = "etai_linear_pending";
export const LINEAR_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
export const LINEAR_PENDING_MAX_AGE = 60 * 10;

export interface LinearTeamChoice {
  id: string;
  key: string;
  name: string;
}

export interface LinearAccount {
  viewerName: string;
  workspaceId: string;
  workspaceName: string;
  teams: LinearTeamChoice[];
}

export interface LinearSession {
  apiKey: string;
  teamId: string;
  teamKey: string;
  teamName: string;
  workspaceId: string;
  workspaceName: string;
}

interface PendingKey {
  apiKey: string;
  viewerName: string;
  workspaceId: string;
  workspaceName: string;
  teams: LinearTeamChoice[];
}

export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, maxAge: number): void;
  delete(name: string): void;
}

export type InspectResult = { ok: true; account: LinearAccount } | { ok: false; message: string };

const INVALID = "Cette clé n'est pas reconnue par Linear.";
const NO_TEAM = "Cette clé n'a accès à aucune équipe.";

/** La clé ne figure ni dans le message, ni dans l'objet renvoyé. */
export async function inspectLinearAccount(
  apiKey: string,
  probe: (apiKey: string) => Promise<LinearAccount>,
): Promise<InspectResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { ok: false, message: INVALID };
  try {
    const account = await probe(trimmed);
    if (!account.teams.length) return { ok: false, message: NO_TEAM };
    return {
      ok: true,
      account: {
        viewerName: account.viewerName,
        workspaceId: account.workspaceId,
        workspaceName: account.workspaceName,
        teams: account.teams.map((team) => ({ id: team.id, key: team.key, name: team.name })),
      },
    };
  } catch {
    return { ok: false, message: INVALID };
  }
}

export function beginLinearConnect(account: LinearAccount, apiKey: string, jar: CookieJar, key: Buffer): void {
  jar.set(
    LINEAR_PENDING_COOKIE,
    sealJson({ apiKey: apiKey.trim(), viewerName: account.viewerName, workspaceId: account.workspaceId, workspaceName: account.workspaceName, teams: account.teams } satisfies PendingKey, key),
    LINEAR_PENDING_MAX_AGE,
  );
}

export function finishLinearConnect(teamId: string, jar: CookieJar, key: Buffer): { ok: true; session: Omit<LinearSession, "apiKey"> } | { ok: false; message: string } {
  const raw = jar.get(LINEAR_PENDING_COOKIE);
  const pending = raw ? openJson<PendingKey>(raw, key) : null;
  if (!pending?.apiKey || !pending.teams?.length) return { ok: false, message: "La clé a expiré. Saisissez-la à nouveau." };
  const team = pending.teams.find((item) => item.id === teamId);
  if (!team) return { ok: false, message: "Cette équipe n'est pas accessible avec cette clé." };
  const session: LinearSession = {
    apiKey: pending.apiKey,
    teamId: team.id,
    teamKey: team.key,
    teamName: team.name,
    workspaceId: pending.workspaceId,
    workspaceName: pending.workspaceName,
  };
  jar.set(LINEAR_SESSION_COOKIE, sealJson(session, key), LINEAR_SESSION_MAX_AGE);
  jar.delete(LINEAR_PENDING_COOKIE);
  return {
    ok: true,
    session: {
      teamId: session.teamId,
      teamKey: session.teamKey,
      teamName: session.teamName,
      workspaceId: session.workspaceId,
      workspaceName: session.workspaceName,
    },
  };
}

export function disconnectLinear(jar: CookieJar): void {
  jar.delete(LINEAR_SESSION_COOKIE);
  jar.delete(LINEAR_PENDING_COOKIE);
}

export function readLinearSession(token: string | undefined, key: Buffer | null): LinearSession | null {
  if (!token || !key) return null;
  const session = openJson<LinearSession>(token, key);
  if (!session?.apiKey || !session.teamId || !session.workspaceId) return null;
  return session;
}

/** Session du navigateur, sinon la clé du serveur. Jamais les deux mélangées. */
export function activeLinearCredentials(
  session: LinearSession | null,
  env: { apiKey?: string; teamId?: string },
): { apiKey: string; teamId: string; source: "session" | "default" } | null {
  if (session) return { apiKey: session.apiKey, teamId: session.teamId, source: "session" };
  const apiKey = env.apiKey?.trim();
  const teamId = env.teamId?.trim();
  if (apiKey && teamId) return { apiKey, teamId, source: "default" };
  return null;
}
