import type { Account, Feedback, LinearExport } from "../schemas";
import type { RunState } from "../pipeline/state";

export interface LinearComments {
  listComments(issueId: string): Promise<{ body: string }[]>;
  createComment(input: { issueId: string; body: string }): Promise<void>;
}

export const feedbackMarker = (feedbackId: string) => `<!-- etai-feedback:${feedbackId} -->`;

const CHANNEL: Record<string, string> = {
  email: "E-mail",
  ticket_support: "Ticket support",
  avis_g2: "Avis G2",
  avis_capterra: "Avis Capterra",
  forum_produit: "Forum produit",
  reddit: "Reddit",
  x: "X",
  social: "X",
};

export function commentBody(input: {
  feedbackId: string;
  quote: string;
  company: string;
  channel: string;
  receivedAt: string;
  reachBefore: number;
  reachAfter: number;
}): string {
  const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(
    new Date(input.receivedAt),
  );
  const reach =
    input.reachBefore === input.reachAfter
      ? `Reach : ${input.reachAfter} compte${input.reachAfter > 1 ? "s" : ""}.`
      : `Reach : ${input.reachBefore} → ${input.reachAfter} compte${input.reachAfter > 1 ? "s" : ""}.`;
  return [feedbackMarker(input.feedbackId), `${input.company} · ${input.channel} · ${when}`, `> ${input.quote}`, reach].join("\n\n");
}

export interface FeedbackMark {
  tone: "traite" | "ajoute" | "attente";
  text: string;
  message?: string;
}

/** Marque affichée sur un feedback d'un thème déjà exporté. */
export function feedbackLinearMark(themes: readonly { feedbackIds: string[]; relatedSignalIds: string[]; linearExport?: LinearExport }[], feedbackId: string): FeedbackMark | null {
  for (const theme of themes) {
    const exp = theme.linearExport;
    if (!exp) continue;
    const onTheme = theme.feedbackIds.includes(feedbackId) || theme.relatedSignalIds.includes(feedbackId);
    if (!onTheme) continue;
    const pending = exp.pending.find((item) => item.feedbackId === feedbackId);
    if (pending) return { tone: "attente", text: `En attente · ${exp.identifier}`, message: pending.message };
    if (exp.comments.some((item) => item.feedbackId === feedbackId)) return { tone: "ajoute", text: `Ajouté à ${exp.identifier}` };
    if (exp.feedbackIds.includes(feedbackId)) return { tone: "traite", text: `Traité · ${exp.identifier}` };
    return { tone: "attente", text: `En attente · ${exp.identifier}`, message: "Le commentaire n'a pas encore été envoyé." };
  }
  return null;
}

function quoteOf(state: RunState, feedbackId: string, fallback: string): string {
  const quote = state.themes.flatMap((theme) => theme.quotes).find((item) => item.feedbackId === feedbackId)?.text
    ?? state.classifications.find((item) => item.feedbackId === feedbackId)?.quotes[0]?.text;
  const text = (quote ?? fallback).replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 140).trimEnd()}…` : text;
}

function companyOf(state: RunState, feedback: Feedback, accounts: readonly Account[]): string {
  const match = state.matches.find((item) => item.feedbackId === feedback.id);
  const account = match?.accountId ? accounts.find((item) => item.id === match.accountId) : undefined;
  return account?.nom ?? feedback.author.name ?? "Compte non rapproché";
}

/**
 * Commente l'issue d'un thème déjà engagé. Une erreur Linear met le feedback en attente
 * sans interrompre l'ingestion. Un second essai ne crée pas un second commentaire.
 */
export async function annotateEngagedFeedback(
  state: RunState,
  feedback: Feedback,
  accounts: readonly Account[],
  reachBefore: number,
  linear: LinearComments | null,
): Promise<RunState> {
  const theme = state.themes.find(
    (item) => item.linearExport && (item.feedbackIds.includes(feedback.id) || item.relatedSignalIds.includes(feedback.id)),
  );
  if (!theme?.linearExport) return state;
  const exp = theme.linearExport;
  if (exp.feedbackIds.includes(feedback.id)) return state;
  const reachAfter = state.rice.find((score) => score.themeKey === theme.key)?.reach.accounts.length ?? reachBefore;
  const body = commentBody({
    feedbackId: feedback.id,
    quote: quoteOf(state, feedback.id, feedback.text),
    company: companyOf(state, feedback, accounts),
    channel: CHANNEL[feedback.channel] ?? feedback.channel,
    receivedAt: feedback.receivedAt,
    reachBefore,
    reachAfter,
  });
  const already = exp.comments.some((item) => item.feedbackId === feedback.id);
  let posted = already;
  let message = "Linear déconnecté : le commentaire est en attente.";
  if (!already && linear) {
    try {
      const existing = await linear.listComments(exp.id);
      if (existing.some((comment) => comment.body.includes(feedbackMarker(feedback.id)))) posted = true;
      else {
        await linear.createComment({ issueId: exp.id, body });
        posted = true;
      }
    } catch {
      posted = false;
      message = "Linear n'a pas enregistré le commentaire. Il reste en attente.";
    }
  }
  const linearExport: LinearExport = posted
    ? {
        ...exp,
        comments: already ? exp.comments : [...exp.comments, { feedbackId: feedback.id, at: new Date().toISOString() }],
        pending: exp.pending.filter((item) => item.feedbackId !== feedback.id),
      }
    : {
        ...exp,
        pending: exp.pending.some((item) => item.feedbackId === feedback.id)
          ? exp.pending.map((item) => (item.feedbackId === feedback.id ? { ...item, message } : item))
          : [...exp.pending, { feedbackId: feedback.id, message }],
      };
  return {
    ...state,
    themes: state.themes.map((item) => (item.key === theme.key ? { ...item, linearExport } : item)),
  };
}
