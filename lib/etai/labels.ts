import type { Channel, ConstraintKind, FeedbackType, IdentityConfidence, MoscowClass, MoscowDecision, ThemeCategory } from "@/core/schemas";

export { CATEGORY_LABEL, num, pct } from "@/core/report/format";

/** Version courte pour les listes ; le libellé complet reste dans l'infobulle. */
export const CATEGORY_SHORT_LABEL: Record<ThemeCategory, string> = {
  bug: "Bug",
  amelioration: "Amélioration",
  nouvelle_fonctionnalite: "Nouveauté",
};

export const MOSCOW_ORDER: MoscowClass[] = ["Must", "Should", "Could", "À confirmer", "Hors arbitrage", "Won't"];

export const CONSTRAINT_LABEL: Record<ConstraintKind, string> = {
  contrat: "Contrat",
  securite: "Sécurité",
  coeur_casse: "Cœur du produit cassé",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: "E-mail",
  ticket_support: "Ticket support",
  avis_g2: "Avis G2",
  avis_capterra: "Avis Capterra",
  forum_produit: "Forum produit",
  reddit: "Reddit",
  x: "X",
};

export const REPLY_LABEL = {
  email: "E-mail",
  message_prive: "Message privé",
  reponse_publique: "Réponse publique",
} as const;

export const TYPE_LABEL: Record<FeedbackType, string> = {
  bug: "Bug",
  demande: "Demande",
  friction: "Friction",
  question: "Question",
  eloge: "Éloge",
  signal_churn: "Signal de churn",
  hors_sujet: "Hors sujet",
};

/** Nom saisi, puis compte. Les feedbacks seed ont déjà un nom d'auteur ; un ajout direct doit montrer le sien. */
export function feedbackWho(
  author: { name: string | null; anonymous: boolean },
  accountName: string | undefined,
  fallback: string,
): string {
  const person = author.anonymous ? null : author.name?.trim() || null;
  if (person && accountName) return `${person} · ${accountName}`;
  return person ?? accountName ?? fallback;
}

export const MATCH_LABEL: Record<IdentityConfidence, string> = {
  certaine: "Compte certain",
  probable: "Compte probable",
  faible: "Rapprochement faible",
  non_rapproche: "Non rapproché",
  anonyme: "Anonyme",
};

export const TREND_LABEL = { tendance: "En hausse", recurrent: "Récurrent", ponctuel: "Ponctuel" } as const;

/** Libellés des règles du filet anti-injection (core/security/injection.ts). */
export const SIGNAL_LABEL: Record<string, string> = {
  ignorer_consignes: "demande d'ignorer les consignes",
  ignore_instructions_en: "demande d'ignorer les instructions (anglais)",
  disregard: "« disregard »",
  role_systeme: "faux message système",
  changement_de_role: "tentative de changer le rôle de l'agent",
  note_a_l_agent: "note adressée à l'agent",
  score_force: "score imposé",
  classe_forcee: "classe MoSCoW imposée",
  exfiltration: "demande d'envoyer des données clients",
  envoi_vers_url: "envoi vers une URL",
  dissimulation: "demande de cacher l'action au PO",
};

export function eur(value: number): string {
  return `${value.toLocaleString("fr-FR")} €`;
}

const EXPORTABLE: MoscowClass[] = ["Must", "Should", "Could"];

/** Pourquoi un thème ne peut pas partir vers le backlog, ou null s'il le peut. */
export function exportBlock(decision: MoscowDecision | undefined): { tone: "review" | "out"; message: string } | null {
  if (!decision) return { tone: "out", message: "Thème absent de la priorisation de ce lot." };
  if (!EXPORTABLE.includes(decision.moscow)) {
    return { tone: "out", message: `Classé ${decision.moscow} : seuls les Must, Should et Could partent vers le backlog.` };
  }
  if (decision.constraint?.confirmationStale) {
    return {
      tone: "review",
      message: "À revoir : la contrainte a été confirmée sur des preuves qui ont changé depuis. Reconfirmez-la dans data/po-decisions.json avant d'exporter.",
    };
  }
  return null;
}

export function highlightQuotes(text: string, quotes: readonly string[]): { text: string; quote: boolean }[] {
  const ranges = quotes
    .map((q) => ({ start: text.indexOf(q), length: q.length }))
    .filter((r) => r.start >= 0)
    .sort((a, b) => a.start - b.start);
  const parts: { text: string; quote: boolean }[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue;
    if (r.start > cursor) parts.push({ text: text.slice(cursor, r.start), quote: false });
    parts.push({ text: text.slice(r.start, r.start + r.length), quote: true });
    cursor = r.start + r.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), quote: false });
  return parts;
}
