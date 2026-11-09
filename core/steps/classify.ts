import { z } from "zod";
import { checkQuotes, isExactQuote } from "../evidence/quotes";
import { COMPANY_CONTEXT, DATA_BOUNDARY_RULES, frameData } from "../llm/prompts";
import type { DecisionPlan } from "../llm/profiles";
import type { LlmProvider } from "../llm/provider";
import { ClassificationLlmSchema, type FeedbackClassification, type FeedbackType, type MaskedFeedback } from "../schemas";
import { screenForInjection } from "../security/injection";
import { hashOf } from "../util/hash";
import { decideForFeedback, type ThemeOption } from "./decide";

/** Première phrase, sous-chaîne exacte du texte. Remplace un appel de modèle quand Jev a déjà décidé. */
export function exactExcerpt(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;
  const sentence = trimmed.split(/(?<=[.!?…])\s+/)[0] ?? trimmed;
  const quote = (sentence.length >= 3 ? sentence : trimmed).slice(0, 240).trimEnd();
  return trimmed.includes(quote) && quote.length >= 3 ? quote : null;
}

function decisionsAreExternal(decider: DecisionPlan): boolean {
  return Boolean(decider.type && decider.injection && decider.critical);
}

const QUOTE_SYSTEM = `${COMPANY_CONTEXT}

Tâche : extraire le problème vécu et une à trois citations exactes. Ne décide ni du type, ni de la gravité, ni d'une injection : c'est déjà fait.
Le problème sous-jacent décrit ce que vit le client, pas la solution qu'il propose.
actionable vaut false quand le texte est trop flou pour écrire une story ou un ticket.
Les citations sont copiées mot pour mot, sans reformulation.

${DATA_BOUNDARY_RULES}`;

export const QuoteExtractionSchema = z.object({
  underlyingProblem: z.string().min(1),
  actionable: z.boolean(),
  quotes: z.array(z.string().min(3)).max(3),
});

const SYSTEM = `${COMPANY_CONTEXT}

Tâche : classer un feedback client.
Types possibles :
- bug : le produit ne fait pas ce qu'il devrait (erreur, perte, blocage). Donne une sévérité : critique si des données sont perdues avec un enjeu de sécurité ou d'échéance, majeure si le travail est bloqué ou perdu, mineure sinon.
- demande : le client demande une capacité nouvelle.
- friction : la capacité existe ou le besoin est connu, mais l'usage coûte du temps ou de l'effort.
- question : demande d'aide ou de documentation.
- eloge : retour positif sans demande.
- signal_churn : le client annonce ou envisage de partir, de ne pas renouveler, ou cite un concurrent.
- hors_sujet : facturation, démarchage, question commerciale, spam, ou message sans rapport avec le produit.
Le problème sous-jacent décrit ce que vit le client, pas la solution qu'il propose.
actionable vaut false quand le texte est trop flou pour écrire une story ou un ticket.

${DATA_BOUNDARY_RULES}`;

export function classificationInput(feedback: MaskedFeedback) {
  return {
    id: feedback.id,
    channel: feedback.channel,
    language: feedback.language,
    text: feedback.maskedText,
  };
}

export async function classifyFeedback(
  feedback: MaskedFeedback,
  provider: LlmProvider,
  releasedFromQuarantine: readonly string[] = [],
  decider: DecisionPlan = {},
  themes: readonly ThemeOption[] = [],
): Promise<FeedbackClassification> {
  const screen = screenForInjection(feedback.maskedText);
  if (decisionsAreExternal(decider) && themes.length > 0) {
    const decided = await decideForFeedback(feedback, decider, themes);
    return classificationFromDecisions(feedback, decided, screen.signals, releasedFromQuarantine);
  }
  if (decisionsAreExternal(decider)) {
    const decided = await decideForFeedback(feedback, decider);
    const extracted = await provider.generate({
      task: "classify",
      key: feedback.id,
      system: QUOTE_SYSTEM,
      prompt: [
        `Feedback reçu le ${feedback.receivedAt.slice(0, 10)} via ${feedback.channel}.`,
        frameData({ id: feedback.id, canal: feedback.channel, langue: feedback.language }, feedback.maskedText),
      ].join("\n\n"),
      schema: QuoteExtractionSchema,
      inputHash: hashOf({ ...classificationInput(feedback), role: "citations" }),
    });
    return classificationFromExtraction(feedback, decided, extracted, screen.signals, releasedFromQuarantine);
  }
  const prompt = [
    `Feedback reçu le ${feedback.receivedAt.slice(0, 10)} via ${feedback.channel}.`,
    frameData({ id: feedback.id, canal: feedback.channel, langue: feedback.language }, feedback.maskedText),
  ].join("\n\n");

  const out = await provider.generate({
    task: "classify",
    key: feedback.id,
    system: SYSTEM,
    prompt,
    schema: ClassificationLlmSchema,
    inputHash: hashOf(classificationInput(feedback)),
  });

  const texts = new Map([[feedback.id, feedback.maskedText]]);
  const quotes = checkQuotes(
    out.quotes.map((text) => ({ feedbackId: feedback.id, text })),
    texts,
  );
  const decided = await decideForFeedback(feedback, decider);
  const type = decided.type ?? out.type;
  const modelSuspected = decided.injectionSuspected ?? out.injection.suspected;
  const severity = decided.severity !== undefined ? decided.severity : out.severity;

  const excerptOk = out.injection.excerpt !== null && isExactQuote(out.injection.excerpt, feedback.maskedText);
  const suspected = modelSuspected || screen.signals.length > 0;
  const released = releasedFromQuarantine.includes(feedback.id);

  return {
    feedbackId: feedback.id,
    type,
    severity: type === "bug" ? severity : null,
    underlyingProblem: out.underlyingProblem,
    actionable: out.actionable,
    ...(Object.keys(decided.traces).length > 0 ? { decisions: decided.traces } : {}),
    injection: {
      llmSuspected: modelSuspected,
      heuristicSignals: screen.signals,
      quarantined: suspected && !released,
      releasedByPo: suspected && released,
    },
    quotes: quotes.accepted,
    rejectedQuotes: [
      ...quotes.rejected.map((q) => q.text),
      ...(out.injection.excerpt !== null && !excerptOk ? [out.injection.excerpt] : []),
    ],
  };
}

function classificationFromExtraction(
  feedback: MaskedFeedback,
  decided: Awaited<ReturnType<typeof decideForFeedback>>,
  extracted: z.infer<typeof QuoteExtractionSchema>,
  heuristicSignals: string[],
  releasedFromQuarantine: readonly string[],
): FeedbackClassification {
  const texts = new Map([[feedback.id, feedback.maskedText]]);
  const quotes = checkQuotes(
    extracted.quotes.map((text) => ({ feedbackId: feedback.id, text })),
    texts,
  );
  const type = decided.type ?? "hors_sujet";
  const suspected = (decided.injectionSuspected ?? false) || heuristicSignals.length > 0;
  const released = releasedFromQuarantine.includes(feedback.id);
  return {
    feedbackId: feedback.id,
    type,
    severity: type === "bug" ? (decided.severity ?? null) : null,
    underlyingProblem: extracted.underlyingProblem,
    actionable: extracted.actionable,
    ...(Object.keys(decided.traces).length > 0 ? { decisions: decided.traces } : {}),
    injection: {
      llmSuspected: decided.injectionSuspected ?? false,
      heuristicSignals,
      quarantined: suspected && !released,
      releasedByPo: suspected && released,
    },
    quotes: quotes.accepted,
    rejectedQuotes: quotes.rejected.map((quote) => quote.text),
  };
}

function classificationFromDecisions(
  feedback: MaskedFeedback,
  decided: Awaited<ReturnType<typeof decideForFeedback>>,
  heuristicSignals: string[],
  releasedFromQuarantine: readonly string[],
): FeedbackClassification {
  const type = (decided.type ?? "hors_sujet") as FeedbackType;
  const suspected = (decided.injectionSuspected ?? false) || heuristicSignals.length > 0;
  const released = releasedFromQuarantine.includes(feedback.id);
  const quote = exactExcerpt(feedback.maskedText);
  const actionable = (type === "bug" || type === "demande" || type === "friction") && feedback.maskedText.trim().length >= 12;
  return {
    feedbackId: feedback.id,
    type,
    severity: type === "bug" ? (decided.severity ?? null) : null,
    underlyingProblem: quote ?? feedback.maskedText.trim().slice(0, 240),
    actionable,
    ...(Object.keys(decided.traces).length > 0 || decided.theme ? { decisions: decided.traces } : {}),
    ...(decided.theme ? { themeChoice: decided.theme } : {}),
    injection: {
      llmSuspected: decided.injectionSuspected ?? false,
      heuristicSignals,
      quarantined: suspected && !released,
      releasedByPo: suspected && released,
    },
    quotes: quote ? [{ feedbackId: feedback.id, text: quote }] : [],
    rejectedQuotes: [],
  };
}

export async function classifyAll(
  feedbacks: MaskedFeedback[],
  provider: LlmProvider,
  released: readonly string[],
  decider: DecisionPlan = {},
  concurrency = 4,
  themes: readonly ThemeOption[] = [],
): Promise<FeedbackClassification[]> {
  const results: FeedbackClassification[] = new Array(feedbacks.length);
  let next = 0;
  const worker = async () => {
    while (next < feedbacks.length) {
      const i = next++;
      results[i] = await classifyFeedback(feedbacks[i]!, provider, released, decider, themes);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, feedbacks.length) }, worker));
  return results;
}

export function isThemeEligible(c: FeedbackClassification): boolean {
  return (
    !c.injection.quarantined && c.actionable && (c.type === "demande" || c.type === "friction" || c.type === "bug")
  );
}

export function isRelatedSignal(c: FeedbackClassification): boolean {
  return !c.injection.quarantined && c.type === "signal_churn";
}

export function needsInvestigation(c: FeedbackClassification): boolean {
  return !c.injection.quarantined && !c.actionable && c.type !== "hors_sujet";
}
