/** Réglages de l'écoute X. Aucun secret ici : le jeton reste dans l'action serveur. */

export const DEFAULT_X_QUERY = "#etai OR @etai";
export const DEFAULT_POLL_SECONDS = 20;
export const MIN_POLL_SECONDS = 10;
export const SESSION_LIMIT_MS = 30 * 60 * 1000;
export const ACTIVATION_MARGIN_MS = 2 * 60 * 1000;
export const DEFAULT_MAX_SESSION_USD = 0.5;
export const DEFAULT_MAX_AGE_DAYS = 7;
export const MAX_LOOKBACK_HOURS = 72;
export const MAX_POSTS_PER_POLL = 5;

export function readPollSeconds(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POLL_SECONDS;
  return Math.max(MIN_POLL_SECONDS, Math.round(parsed));
}

export function readSessionCapUsd(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_SESSION_USD;
  return parsed;
}

export function readMaxAgeDays(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_AGE_DAYS;
  return Math.min(30, Math.round(parsed));
}

export function capMicro(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/**
 * Point de départ d'un passage.
 * Sans plan B, seuls les posts publiés après l'activation, moins 2 minutes, passent.
 * Une activation trop ancienne est ramenée à la durée de session, pour qu'un client
 * ne rejoue pas l'historique en mentant sur l'heure d'ouverture.
 */
export function resolveSince(input: {
  now: Date;
  activatedAt: Date;
  lookbackHours: number;
  maxAgeDays?: number;
}): Date {
  const maxAgeMs = (input.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  const oldest = new Date(input.now.getTime() - maxAgeMs);
  const hours = Number.isFinite(input.lookbackHours) ? Math.min(MAX_LOOKBACK_HOURS, Math.max(0, input.lookbackHours)) : 0;
  if (hours > 0) {
    const lookback = new Date(input.now.getTime() - hours * 60 * 60 * 1000);
    return lookback < oldest ? oldest : lookback;
  }
  const activatedMs = Math.min(input.activatedAt.getTime(), input.now.getTime());
  const start = Math.max(activatedMs, input.now.getTime() - SESSION_LIMIT_MS);
  const since = new Date(start - ACTIVATION_MARGIN_MS);
  return since < oldest ? oldest : since;
}

export function listenGate(input: {
  inFlight: boolean;
  paused: boolean;
  startedAt: number;
  now: number;
  spentMicro: number;
  capMicro: number;
}): { poll: boolean; stop: null | "duree" | "cout" } {
  if (input.spentMicro >= input.capMicro) return { poll: false, stop: "cout" };
  if (input.now - input.startedAt >= SESSION_LIMIT_MS) return { poll: false, stop: "duree" };
  if (input.paused || input.inFlight) return { poll: false, stop: null };
  return { poll: true, stop: null };
}

export function formatDelay(ms: number): string {
  const safe = Math.max(0, Math.round(ms / 1000));
  if (safe < 60) return `${safe} s`;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (minutes < 60) return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function delayMs(fromIso: string, toIso: string): number {
  const delta = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(delta) ? Math.max(0, delta) : 0;
}
