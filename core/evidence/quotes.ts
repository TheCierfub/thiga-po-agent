import type { Quote } from "../schemas";

/** Une citation est acceptée seulement si elle figure telle quelle dans le texte vu par le LLM. */
export function isExactQuote(quote: string, text: string): boolean {
  const q = quote.trim();
  return q.length >= 3 && text.includes(q);
}

export interface QuoteCheck {
  accepted: Quote[];
  rejected: Quote[];
}

/**
 * `texts` contient le texte masqué de chaque feedback autorisé.
 * Une citation qui renvoie à un feedback hors de ce périmètre est rejetée, même si le texte existe.
 */
export function checkQuotes(quotes: Quote[], texts: ReadonlyMap<string, string>): QuoteCheck {
  const accepted: Quote[] = [];
  const rejected: Quote[] = [];
  for (const quote of quotes) {
    const text = texts.get(quote.feedbackId);
    if (text !== undefined && isExactQuote(quote.text, text)) {
      accepted.push({ feedbackId: quote.feedbackId, text: quote.text.trim() });
    } else {
      rejected.push(quote);
    }
  }
  return { accepted, rejected };
}
