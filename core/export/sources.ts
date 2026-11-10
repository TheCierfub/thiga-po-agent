import type { Channel, MaskedFeedback, Quote } from "../schemas";

const CHANNEL: Record<Channel, string> = {
  email: "E-mail",
  ticket_support: "Ticket support",
  avis_g2: "Avis G2",
  avis_capterra: "Avis Capterra",
  forum_produit: "Forum produit",
  reddit: "Reddit",
  x: "X",
  social: "X",
};

function when(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(iso));
}

function short(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 110 ? `${line.slice(0, 110).trimEnd()}…` : line;
}

/** Liste stable des feedbacks, placée sous la story dans l'issue. */
export function renderFeedbackSources(input: {
  feedbackIds: readonly string[];
  feedbacks: readonly MaskedFeedback[];
  quotes: readonly Quote[];
  accountName: (feedbackId: string) => string | null;
}): string {
  const byId = new Map(input.feedbacks.map((feedback) => [feedback.id, feedback]));
  const lines = input.feedbackIds.flatMap((id) => {
    const feedback = byId.get(id);
    if (!feedback) return [];
    const quote = input.quotes.find((item) => item.feedbackId === id)?.text ?? short(feedback.maskedText);
    const company = input.accountName(id) ?? feedback.author.name ?? "Compte non rapproché";
    return [`- **${company}** · ${CHANNEL[feedback.channel]} · ${when(feedback.receivedAt)} — ${short(quote)}`];
  });
  if (lines.length === 0) return "";
  return ["## Feedbacks sources", "", ...lines, ""].join("\n");
}
