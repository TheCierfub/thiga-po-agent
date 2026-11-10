import { hashOf } from "../util/hash";

/** Une lecture d'équipe ne doit pas retenir le rendu. */
export const LINEAR_PROBE_TIMEOUT_MS = 3_000;

/** Évite d'interroger Linear à chaque navigation. */
export const LINEAR_STATUS_TTL_MS = 60_000;

export interface LinearTeamLabel {
  key: string;
  name: string;
  id?: string;
  workspaceId?: string;
  workspaceName?: string;
}

export type LinearStatus =
  | { connected: true; team: LinearTeamLabel }
  | { connected: false; reason: "absent" | "injoignable" };

export interface LinearStatusCache {
  get(key: string): { at: number; status: LinearStatus } | undefined;
  set(key: string, value: { at: number; status: LinearStatus }): void;
}

export function memoryLinearStatusCache(): LinearStatusCache {
  const store = new Map<string, { at: number; status: LinearStatus }>();
  return {
    get: (key) => store.get(key),
    set: (key, value) => {
      store.set(key, value);
    },
  };
}

export async function resolveLinearStatus(input: {
  apiKey: string | undefined;
  teamId: string | undefined;
  now: number;
  cache: LinearStatusCache;
  probe: (apiKey: string, teamId: string, signal: AbortSignal) => Promise<LinearTeamLabel | null>;
  timeoutMs?: number;
}): Promise<LinearStatus> {
  const apiKey = input.apiKey?.trim() ?? "";
  const teamId = input.teamId?.trim() ?? "";
  const cacheKey = hashOf({ apiKey, teamId });
  const hit = input.cache.get(cacheKey);
  if (hit && input.now - hit.at < LINEAR_STATUS_TTL_MS) return hit.status;

  const remember = (status: LinearStatus) => {
    input.cache.set(cacheKey, { at: input.now, status });
    return status;
  };
  if (!apiKey || !teamId) return remember({ connected: false, reason: "absent" });

  const timeoutMs = input.timeoutMs ?? LINEAR_PROBE_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  try {
    const team = await Promise.race([input.probe(apiKey, teamId, controller.signal), timeout]);
    if (!team?.key) return remember({ connected: false, reason: "injoignable" });
    return remember({
      connected: true,
      team: {
        key: team.key,
        name: team.name,
        ...(team.id ? { id: team.id } : {}),
        ...(team.workspaceId ? { workspaceId: team.workspaceId } : {}),
        ...(team.workspaceName ? { workspaceName: team.workspaceName } : {}),
      },
    });
  } catch {
    return remember({ connected: false, reason: "injoignable" });
  } finally {
    clearTimeout(timer);
  }
}
