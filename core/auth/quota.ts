export const QUOTA_REACHED = "Limite du jour atteinte, réessayez demain.";
export const MAGIC_LINK_LIMIT = "Trop de liens demandés. Réessayez plus tard.";

export const USAGE_ACTIONS = ["story", "feedback", "export"] as const;
export type UsageAction = (typeof USAGE_ACTIONS)[number];

export interface UsageCounter {
  userId: string;
  action: UsageAction;
  day: string;
  count: number;
}

export interface QuotaLimits {
  storyUser: number;
  storyGlobal: number;
  feedbackUser: number;
  exportUser: number;
  exportGlobal: number;
}

export const DEFAULT_QUOTA_LIMITS: QuotaLimits = {
  storyUser: 5,
  storyGlobal: 30,
  feedbackUser: 20,
  exportUser: 5,
  exportGlobal: 20,
};

export function readQuotaNumber(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export function limitsFor(env: Record<string, string | undefined>): QuotaLimits {
  return {
    storyUser: readQuotaNumber(env.QUOTA_STORY_PER_USER, DEFAULT_QUOTA_LIMITS.storyUser),
    storyGlobal: readQuotaNumber(env.QUOTA_STORY_GLOBAL, DEFAULT_QUOTA_LIMITS.storyGlobal),
    feedbackUser: readQuotaNumber(env.QUOTA_FEEDBACK_PER_USER, DEFAULT_QUOTA_LIMITS.feedbackUser),
    exportUser: readQuotaNumber(env.QUOTA_EXPORT_PER_USER, DEFAULT_QUOTA_LIMITS.exportUser),
    exportGlobal: readQuotaNumber(env.QUOTA_EXPORT_GLOBAL, DEFAULT_QUOTA_LIMITS.exportGlobal),
  };
}

export function quotaFor(action: UsageAction, limits: QuotaLimits): { user: number; global: number | null } {
  if (action === "story") return { user: limits.storyUser, global: limits.storyGlobal };
  if (action === "feedback") return { user: limits.feedbackUser, global: null };
  return { user: limits.exportUser, global: limits.exportGlobal };
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

export interface MagicAttempt {
  email: string;
  ip: string;
  at: number;
}

/** Fenêtre glissante, en plus du plafond d'envoi de Supabase. */
export function allowMagicLink(input: {
  email: string;
  ip: string;
  now: number;
  history: readonly MagicAttempt[];
  emailLimit: number;
  ipLimit: number;
  windowMs: number;
}): { ok: true; history: MagicAttempt[] } | { ok: false; message: string; history: MagicAttempt[] } {
  const email = input.email.trim().toLowerCase();
  const ip = input.ip.trim() || "inconnue";
  const fresh = input.history.filter((attempt) => input.now - attempt.at < input.windowMs);
  const byEmail = fresh.filter((attempt) => attempt.email === email).length;
  const byIp = fresh.filter((attempt) => attempt.ip === ip).length;
  if (byEmail >= input.emailLimit || byIp >= input.ipLimit) return { ok: false, message: MAGIC_LINK_LIMIT, history: fresh };
  return { ok: true, history: [...fresh, { email, ip, at: input.now }] };
}
