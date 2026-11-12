import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "etai_access";
export const ACCESS_MAX_AGE_S = 60 * 60 * 24 * 7;
export const ACCESS_REQUIRED = "Accès requis.";
export const ACCESS_CLOSED = "L'accès n'est pas configuré.";
export const ACCESS_DENIED = "Code incorrect.";
export const ACCESS_LIMIT = "Trop de tentatives. Réessayez plus tard.";
export const ACCESS_ATTEMPT_LIMIT = 10;
export const ACCESS_WINDOW_MS = 15 * 60 * 1000;

export function accessConfigured(code: string | undefined, secret: string | undefined): boolean {
  return Boolean(code?.trim() && secret?.trim());
}

/** Comparaison à temps constant, y compris si les longueurs diffèrent. */
export function codesMatch(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function checkAccessCode(input: string, expected: string | undefined): "closed" | "ok" | "bad" {
  const code = expected?.trim();
  if (!code) return "closed";
  return codesMatch(input, code) ? "ok" : "bad";
}

export function signAccessCookie(secret: string, exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyAccessCookie(token: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!token || !secret?.trim()) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret.trim()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof body.exp === "number" && body.exp * 1000 > now;
  } catch {
    return false;
  }
}

export interface AccessAttempt {
  ip: string;
  at: number;
}

export function allowAccessAttempt(input: {
  ip: string;
  now: number;
  history: readonly AccessAttempt[];
  limit?: number;
  windowMs?: number;
}): { ok: true; history: AccessAttempt[] } | { ok: false; message: string; history: AccessAttempt[] } {
  const ip = input.ip.trim() || "inconnue";
  const windowMs = input.windowMs ?? ACCESS_WINDOW_MS;
  const limit = input.limit ?? ACCESS_ATTEMPT_LIMIT;
  const fresh = input.history.filter((attempt) => input.now - attempt.at < windowMs);
  if (fresh.filter((attempt) => attempt.ip === ip).length >= limit) {
    return { ok: false, message: ACCESS_LIMIT, history: fresh };
  }
  return { ok: true, history: [...fresh, { ip, at: input.now }] };
}
