export const WINDOW_DAYS = 28;
const DAY_MS = 86_400_000;

/** Date locale telle qu'émise par la source (`2026-10-28T18:22:00+01:00` → `2026-10-28`). */
export function localDate(iso: string): string {
  return iso.slice(0, 10);
}

function toUtcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface Window {
  start: string;
  end: string;
}

/** Quatre semaines glissantes, jour de fin inclus. */
export function windowEndingOn(end: string): Window {
  return { start: fromUtcDay(toUtcDay(end) - (WINDOW_DAYS - 1) * DAY_MS), end };
}

export function inWindow(iso: string, window: Window): boolean {
  const d = localDate(iso);
  return d >= window.start && d <= window.end;
}

/** 0 pour la semaine la plus ancienne, 3 pour les sept derniers jours. -1 hors fenêtre. */
export function weekIndex(iso: string, window: Window): number {
  if (!inWindow(iso, window)) return -1;
  const daysBeforeEnd = (toUtcDay(window.end) - toUtcDay(localDate(iso))) / DAY_MS;
  return 3 - Math.floor(daysBeforeEnd / 7);
}
