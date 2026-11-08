import { checkQuotes, isExactQuote } from "../evidence/quotes";
import { COMPANY_CONTEXT, DATA_BOUNDARY_RULES, frameData } from "../llm/prompts";
import type { DecisionPlan } from "../llm/profiles";
import type { LlmProvider } from "../llm/provider";
import { ClassificationLlmSchema, type FeedbackClassification, type MaskedFeedback } from "../schemas";
import { screenForInjection } from "../security/injection";
import { hashOf } from "../util/hash";
import { decideForFeedback } from "./decide";

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
): Promise<FeedbackClassification> {
  const screen = screenForInjection(feedback.maskedText);
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

/** Un appel par feedback, quelques-uns en parallèle. */
export async function classifyAll(
  feedbacks: MaskedFeedback[],
  provider: LlmProvider,
  released: readonly string[],
  decider: DecisionPlan = {},
  concurrency = 4,
): Promise<FeedbackClassification[]> {
  const results: FeedbackClassification[] = new Array(feedbacks.length);
  let next = 0;
  const worker = async () => {
    while (next < feedbacks.length) {
      const i = next++;
      results[i] = await classifyFeedback(feedbacks[i]!, provider, released, decider);
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
