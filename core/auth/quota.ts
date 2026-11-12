export const QUOTA_REACHED = "Limite du jour atteinte, réessayez demain.";
export const GLOBAL_ACTOR = "global";

export const USAGE_ACTIONS = ["story", "feedback", "export"] as const;
export type UsageAction = (typeof USAGE_ACTIONS)[number];

export interface UsageCounter {
  userId: string;
  action: UsageAction;
  day: string;
  count: number;
}

export interface QuotaLimits {
  story: number;
  feedback: number;
  export: number;
}

export const DEFAULT_QUOTA_LIMITS: QuotaLimits = {
  story: 30,
  feedback: 200,
  export: 20,
};

export function readQuotaNumber(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function limitsFor(env: Record<string, string | undefined>): QuotaLimits {
  return {
    story: readQuotaNumber(env.QUOTA_STORY_GLOBAL, DEFAULT_QUOTA_LIMITS.story),
    feedback: readQuotaNumber(env.QUOTA_FEEDBACK_GLOBAL, DEFAULT_QUOTA_LIMITS.feedback),
    export: readQuotaNumber(env.QUOTA_EXPORT_GLOBAL, DEFAULT_QUOTA_LIMITS.export),
  };
}

export function quotaLimit(action: UsageAction, limits: QuotaLimits): number {
  return limits[action];
}

/** Un seul compteur pour toute la démo. */
export function reserveGlobal(
  counters: readonly UsageCounter[],
  input: { action: UsageAction; day: string; limit: number },
): Reservation {
  return reserveUsage(counters, {
    userId: GLOBAL_ACTOR,
    action: input.action,
    day: input.day,
    userLimit: input.limit,
    globalLimit: input.limit,
  });
}

/** Jour civil à Paris : le compteur repart à minuit, pas à l'UTC. */
export function usageDay(now: Date, timeZone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type Reservation =
  | { ok: true; counters: UsageCounter[] }
  | { ok: false; status: 429; message: string };

/**
 * Même règle que la fonction SQL consume_quota : +1 pour ce compte,
 * puis refus si le compte ou le total du jour dépasse le plafond.
 */
export function reserveUsage(
  counters: readonly UsageCounter[],
  input: { userId: string; action: UsageAction; day: string; userLimit: number; globalLimit: number | null },
): Reservation {
  const next = counters.map((row) => ({ ...row }));
  const row = next.find((item) => item.userId === input.userId && item.action === input.action && item.day === input.day);
  const count = (row?.count ?? 0) + 1;
  if (count > input.userLimit) return { ok: false, status: 429, message: QUOTA_REACHED };
  const others = next
    .filter((item) => item.action === input.action && item.day === input.day && item !== row)
    .reduce((sum, item) => sum + item.count, 0);
  if (input.globalLimit !== null && others + count > input.globalLimit) return { ok: false, status: 429, message: QUOTA_REACHED };
  if (row) row.count = count;
  else next.push({ userId: input.userId, action: input.action, day: input.day, count });
  return { ok: true, counters: next };
}

