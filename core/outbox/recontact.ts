import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RunState } from "../pipeline/state";
import type { IdentityConfidence, InvestigationDraft } from "../schemas";
import { recipientOf, REPLY_MODE_BY_CHANNEL } from "../steps/investigate";

export const OUTBOX_DIR = "out/outbox";

const SIGNATURE = "Nadia, produit Étai";
const UNKNOWN_ACCOUNT: IdentityConfidence[] = ["faible", "anonyme", "non_rapproche"];
const ACCOUNT_REQUEST =
  "Pour relier votre message à votre compte et en tenir compte dans nos priorités, pouvez-vous m'indiquer l'identifiant de votre compte Étai, ou à défaut le nom de votre entreprise ?";

export interface RecontactDraft {
  feedbackId: string;
  kind: "investigation" | "identification";
  /** Pourquoi recontacter cet auteur, en une phrase. */
  reason: string;
  channel: string;
  replyMode: InvestigationDraft["replyMode"];
  recipient: string;
  accountKnown: boolean;
  questions: string[];
  subject: string | null;
  body: string;
  /** Début du feedback masqué, pour le contexte. */
  excerpt: string;
}

function withAccountRequest(body: string): string {
  if (/identifiant/i.test(body)) return body;
  const i = body.lastIndexOf(SIGNATURE);
  return i >= 0 ? `${body.slice(0, i)}${ACCOUNT_REQUEST}\n\n${body.slice(i)}` : `${body}\n\n${ACCOUNT_REQUEST}`;
}

/**
 * Brouillons de recontact :
 * - les feedbacks trop flous, avec les questions d'investigation rédigées par le LLM ;
 * - les auteurs d'un thème que l'on n'a pas su rattacher à un compte, pour demander l'identifiant.
 * Une réponse publique (avis G2, Capterra) ne demande jamais d'identifiant.
 */
export function buildRecontactDrafts(state: Pick<RunState, "feedbacks" | "matches" | "investigations" | "themes" | "classifications">): RecontactDraft[] {
  const feedbacks = new Map(state.feedbacks.map((f) => [f.id, f]));
  const matches = new Map(state.matches.map((m) => [m.feedbackId, m]));
  const quarantined = new Set(state.classifications.filter((c) => c.injection.quarantined).map((c) => c.feedbackId));
  const drafts: RecontactDraft[] = [];

  for (const inv of state.investigations) {
    const f = feedbacks.get(inv.feedbackId);
    if (!f) continue;
    const accountKnown = !UNKNOWN_ACCOUNT.includes(matches.get(f.id)?.confidence ?? "non_rapproche");
    drafts.push({
      feedbackId: f.id,
      kind: "investigation",
      reason: "Trop flou pour écrire une story : questions d'investigation.",
      channel: f.channel,
      replyMode: inv.replyMode,
      recipient: inv.recipient,
      accountKnown,
      questions: inv.questions,
      subject: inv.message.subject,
      body: accountKnown || inv.replyMode === "reponse_publique" ? inv.message.body : withAccountRequest(inv.message.body),
      excerpt: f.maskedText.slice(0, 280),
    });
  }

  const seen = new Set(drafts.map((d) => d.feedbackId));
  for (const theme of state.themes) {
    for (const id of [...theme.feedbackIds, ...theme.relatedSignalIds]) {
      const f = feedbacks.get(id);
      const match = matches.get(id);
      if (!f || seen.has(id) || quarantined.has(id) || !match || !UNKNOWN_ACCOUNT.includes(match.confidence)) continue;
      const replyMode = REPLY_MODE_BY_CHANNEL[f.channel];
      if (replyMode === "reponse_publique") continue;
      seen.add(id);
      const name = f.author.anonymous ? null : (f.author.name ?? f.author.handle);
      drafts.push({
        feedbackId: id,
        kind: "identification",
        reason: `Auteur non rattaché à un compte (${match.confidence.replace("_", " ")}) : son retour ne compte pas dans le Reach du thème « ${theme.title} ».`,
        channel: f.channel,
        replyMode,
        recipient: recipientOf(f),
        accountKnown: false,
        questions: [],
        subject: replyMode === "email" ? "Votre retour sur Étai" : null,
        body: [`Bonjour${name ? ` ${name}` : ""},`, `Merci pour votre message. Il rejoint un sujet que nous suivons de près : ${theme.title.charAt(0).toLowerCase()}${theme.title.slice(1)}.`, ACCOUNT_REQUEST, SIGNATURE].join("\n\n"),
        excerpt: f.maskedText.slice(0, 280),
      });
    }
  }
  return drafts;
}

export interface OutboxMessage {
  feedbackId: string;
  batch: string;
  channel: string;
  replyMode: string;
  recipient: string;
  subject: string | null;
  body: string;
}

/**
 * Dépose le message dans une boîte de test locale. Rien ne part : l'envoi réel, par le canal d'origine,
 * reste une action humaine hors de l'agent.
 */
export function writeToOutbox(dir: string, message: OutboxMessage, now: Date = new Date()): string {
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}--${message.feedbackId}.md`);
  const content = [
    "<!-- Boîte de test : ce message n'a été envoyé à personne. -->",
    `Feedback : ${message.feedbackId} (lot ${message.batch})`,
    `Canal : ${message.channel} · mode : ${message.replyMode}`,
    `Destinataire : ${message.recipient}`,
    ...(message.subject ? [`Objet : ${message.subject}`] : []),
    `Déposé le : ${now.toISOString()}`,
    "",
    "---",
    "",
    message.body.trim(),
    "",
  ].join("\n");
  writeFileSync(file, content);
  return file;
}
