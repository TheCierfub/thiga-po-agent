import { COMPANY_CONTEXT, DATA_BOUNDARY_RULES, frameData } from "../llm/prompts";
import type { LlmProvider } from "../llm/provider";
import { maskText } from "../privacy/mask";
import {
  InvestigationLlmSchema,
  type Channel,
  type FeedbackClassification,
  type InvestigationDraft,
  type MaskedFeedback,
} from "../schemas";
import { hashOf } from "../util/hash";

type ReplyMode = InvestigationDraft["replyMode"];

/** Où répondre. Le privé quand le canal le permet, sinon une réponse publique sans donnée personnelle. */
export const REPLY_MODE_BY_CHANNEL: Record<Channel, ReplyMode> = {
  email: "email",
  ticket_support: "email",
  forum_produit: "message_prive",
  reddit: "message_prive",
  x: "message_prive",
  avis_g2: "reponse_publique",
  avis_capterra: "reponse_publique",
};

const MODE_GUIDANCE: Record<ReplyMode, string> = {
  email: "Réponse par e-mail au client connu. Ton direct, merci bref, puis les questions.",
  message_prive:
    "Message privé sur le canal d'origine : remercier, poser les questions, et demander l'identifiant du compte Étai si l'auteur n'est pas rattaché.",
  reponse_publique:
    "Réponse publique : remercier, ne citer aucune donnée personnelle ni aucun détail de compte, renvoyer vers le formulaire de contact pour poursuivre.",
};

const SYSTEM = `${COMPANY_CONTEXT}

Tâche : le feedback est trop flou pour écrire une story. Propose deux ou trois questions précises, puis un brouillon de message prêt à partir.
- Les questions servent à décider : moment du blocage, contournement actuel, chantier ou périmètre concerné.
- Le message est signé « Nadia, produit Étai ». Il ne promet ni date ni fonctionnalité.
- Le brouillon ne sera envoyé qu'après relecture et clic du PO.

${DATA_BOUNDARY_RULES}`;

export function recipientOf(feedback: MaskedFeedback): string {
  if (feedback.author.anonymous) return "auteur anonyme";
  return feedback.author.name ?? feedback.author.handle ?? "auteur inconnu";
}

export async function draftInvestigation(
  feedback: MaskedFeedback,
  classification: FeedbackClassification,
  provider: LlmProvider,
): Promise<InvestigationDraft> {
  const replyMode = REPLY_MODE_BY_CHANNEL[feedback.channel];
  const prompt = [
    `Canal : ${feedback.channel}. ${MODE_GUIDANCE[replyMode]}`,
    `Lecture actuelle : ${classification.type}, « ${classification.underlyingProblem} ».`,
    frameData({ id: feedback.id, canal: feedback.channel }, feedback.maskedText),
  ].join("\n\n");

  const out = await provider.generate({
    task: "investigate",
    key: feedback.id,
    system: SYSTEM,
    prompt,
    schema: InvestigationLlmSchema,
    inputHash: hashOf({ id: feedback.id, text: feedback.maskedText, replyMode }),
  });

  if (maskText(out.message.body).pii.length > 0) {
    throw new Error(`Brouillon ${feedback.id} : le message contient une donnée personnelle, refusé.`);
  }

  return {
    ...out,
    feedbackId: feedback.id,
    channel: feedback.channel,
    replyMode,
    recipient: recipientOf(feedback),
    status: "brouillon_non_envoye",
  };
}
