import { allowAccessAttempt, type AccessAttempt } from "@/core/auth/access-code";

let history: AccessAttempt[] = [];

export function takeAccessAttempt(ip: string, now = Date.now()) {
  const result = allowAccessAttempt({ ip, now, history });
  history = result.history;
  return result.ok ? { ok: true as const } : { ok: false as const, message: result.message };
}
