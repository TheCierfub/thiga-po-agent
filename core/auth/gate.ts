/** Réponse unique, que l'adresse soit autorisée ou non. */
export const MAGIC_LINK_NOTICE = "Si cette adresse est autorisée, un lien vous a été envoyé.";

export const SIGN_IN_REQUIRED = "Connexion requise.";
export const EMAIL_NOT_ALLOWED = "Cette adresse n'est pas autorisée.";

export interface Actor {
  email: string;
}

export type Gate =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; message: string };

/** Virgules, espaces, casse. Les doublons disparaissent. */
export function parseAllowedEmails(raw: string | undefined): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export function isAllowedEmail(email: string, allowed: readonly string[]): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 && allowed.includes(normalized);
}

/** Génération, ajout, écoute, et export avec la clé partagée. */
export function authorizeSpend(actor: Actor | null, allowed: readonly string[]): Gate {
  if (!actor?.email.trim()) return { ok: false, status: 401, message: SIGN_IN_REQUIRED };
  const email = actor.email.trim().toLowerCase();
  if (!isAllowedEmail(email, allowed)) return { ok: false, status: 403, message: EMAIL_NOT_ALLOWED };
  return { ok: true, email };
}

/**
 * La clé personnelle du navigateur autorise l'export sans session.
 * La clé du serveur, elle, exige une adresse autorisée.
 */
export function authorizeLinearExport(actor: Actor | null, allowed: readonly string[], keySource: "session" | "default" | "aucune"): Gate {
  if (keySource === "session") return { ok: true, email: actor?.email.trim().toLowerCase() ?? "" };
  return authorizeSpend(actor, allowed);
}

/** N'envoie le lien que si l'adresse est dans la liste. Le texte renvoyé est toujours le même. */
export function magicLinkDecision(email: string, allowed: readonly string[]): { send: boolean; notice: string } {
  const trimmed = email.trim().toLowerCase();
  const send = trimmed.includes("@") && isAllowedEmail(trimmed, allowed);
  return { send, notice: MAGIC_LINK_NOTICE };
}

/** Empêche un retour vers un autre site. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/lundi";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return "/lundi";
  return value;
}
