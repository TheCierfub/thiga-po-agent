/**
 * Origine vue par le navigateur.
 * Sur Render, request.url vaut l'hôte interne (0.0.0.0:10000) : on ne s'en sert pas en production.
 */
export function getPublicOrigin(input: {
  configuredUrl?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  requestOrigin?: string | null;
  nodeEnv?: string | null;
}): string | null {
  const configured = normalizeOrigin(input.configuredUrl);
  if (configured) return configured;

  const host = firstValue(input.forwardedHost);
  const proto = firstValue(input.forwardedProto);
  if (host && !isInternalHost(host) && (proto === "http" || proto === "https")) {
    return `${proto}://${stripTrailingSlash(host)}`;
  }

  if (input.nodeEnv === "development") return normalizeOrigin(input.requestOrigin);
  return null;
}

/** Redirection du callback. `next` reste un chemin relatif, `etape=cle` compris. */
export function authCallbackLocation(input: {
  origin: string | null;
  next: string | null;
  ok: boolean;
}): string {
  const next = safeRelativePath(input.next);
  const path = input.ok ? next : `/acces?next=${encodeURIComponent(next)}`;
  if (!input.origin) return path;
  return new URL(path, input.origin).toString();
}

/** Chemin interne seulement. Refuse un autre site. */
export function safeRelativePath(value: string | null | undefined): string {
  if (!value) return "/lundi";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.includes("://")) return "/lundi";
  try {
    const url = new URL(trimmed, "http://etai.local");
    if (url.origin !== "http://etai.local") return "/lundi";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/lundi";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/lundi";
  }
}

function normalizeOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isInternalHost(url.host) && url.hostname === "0.0.0.0") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function firstValue(value: string | null | undefined): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function isInternalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return name === "0.0.0.0" || name === "::" || name === "[::]";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
