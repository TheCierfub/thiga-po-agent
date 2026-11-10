export const MAGIC_LINK_SENT = "Un lien de connexion a été envoyé.";
export const SIGN_IN_REQUIRED = "Connexion requise.";

export interface Actor {
  id: string;
  email: string;
}

export type Gate =
  | { ok: true; id: string; email: string }
  | { ok: false; status: 401 | 429; message: string };

/** N'importe quelle session vérifiée. L'inscription n'est pas filtrée par adresse. */
export function authorizeSpend(actor: Actor | null): Gate {
  if (!actor?.id.trim()) return { ok: false, status: 401, message: SIGN_IN_REQUIRED };
  return { ok: true, id: actor.id.trim(), email: actor.email.trim().toLowerCase() };
}

/**
 * La clé personnelle du navigateur autorise l'export sans session.
 * La clé du serveur exige une session. Le plafond est appliqué ensuite.
 */
export function authorizeLinearExport(actor: Actor | null, keySource: "session" | "default" | "aucune"): Gate {
  if (keySource === "session") return { ok: true, id: actor?.id.trim() ?? "", email: actor?.email.trim().toLowerCase() ?? "" };
  return authorizeSpend(actor);
}

/** Une adresse qui ressemble à un e-mail peut recevoir un lien. */
export function canRequestMagicLink(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") && trimmed.length <= 320 && !trimmed.includes(" ");
}

/** Empêche un retour vers un autre site. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/lundi";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return "/lundi";
  return value;
}
