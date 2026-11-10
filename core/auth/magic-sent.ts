export const MAGIC_RESEND_MS = 60_000;

export interface MagicLinkDraft {
  email: string;
  sentAt: number;
}

export type MagicLinkPanel =
  | { mode: "form" }
  | { mode: "sent"; email: string; resendIn: number; canResend: boolean };

/** Après l'envoi, la modale confirme l'adresse au lieu de montrer un champ vide. */
export function magicLinkPanel(draft: MagicLinkDraft | null, now: number): MagicLinkPanel {
  const email = draft?.email.trim();
  if (!email || !draft?.sentAt) return { mode: "form" };
  const remaining = Math.max(0, MAGIC_RESEND_MS - (now - draft.sentAt));
  return {
    mode: "sent",
    email,
    resendIn: Math.ceil(remaining / 1000),
    canResend: remaining === 0,
  };
}
