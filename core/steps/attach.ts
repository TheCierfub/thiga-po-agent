import { checkQuotes } from "../evidence/quotes";
import { COMPANY_CONTEXT, DATA_BOUNDARY_RULES, frameData } from "../llm/prompts";
import type { LlmProvider } from "../llm/provider";
import {
  AttachmentLlmSchema,
  type BacklogIssue,
  type FeedbackAttachment,
  type FeedbackClassification,
  type MaskedFeedback,
  type Quote,
} from "../schemas";
import { hashOf } from "../util/hash";
import type { GroupedTheme } from "./group";

export const ATTACHMENT_RULES = `Avant de créer un thème, compare ce feedback à chaque thème déjà ouvert (titre, résumé, citations).
- sameProblem est vrai quand c'est le même problème vécu, même si le client signale aussi un bug, une régression, des doublons, ou une solution déjà demandée par le thème.
- Un bug et une demande déjà couverte par un thème ne font pas un thème isolé. Soit action vaut « rattacher » et themeKey est la clé existante, soit action vaut « creer » et relatedThemeIds contient la clé du thème proche.
- Ne crée un thème que si aucun thème existant n'est le même problème. La rationale dit alors pourquoi, en une phrase.
- relatedThemeIds reste vide seulement dans ce dernier cas.`;

export interface ExistingThemeBrief {
  key: string;
  title: string;
  problem: string;
  quotes: string[];
  backlogIssueId: string | null;
}

export interface AttachmentInput {
  batch: string;
  feedback: MaskedFeedback;
  classification: FeedbackClassification;
  backlog: BacklogIssue[];
  existingThemes: ExistingThemeBrief[];
}

export interface AttachmentProposal {
  action: "rattacher" | "creer";
  themeKey: string;
  title: string;
  problem: string;
  rationale: string;
  relatedThemeIds: string[];
  comparisons: { themeKey: string; sameProblem: boolean; why: string }[];
  backlogIssueId: string | null;
  backlogRelation: "doublon" | "lie" | "aucun";
  quotes: Quote[];
}

export interface ResolvedAttachment extends Omit<AttachmentProposal, "comparisons"> {
  forced: boolean;
}

const SYSTEM = `${COMPANY_CONTEXT}

Tâche : rattacher un nouveau feedback aux thèmes déjà ouverts, ou en ouvrir un seulement s'il décrit un problème vraiment nouveau.

${ATTACHMENT_RULES}

- Un feedback n'appartient qu'à un thème.
- Les citations sont des extraits exacts du feedback, pas des thèmes existants.
- backlogRelation vaut « doublon » si une issue décrit la même solution, « lie » si elle traite le problème autrement, « aucun » sinon.

${DATA_BOUNDARY_RULES}`;

export function buildAttachmentPrompt(input: AttachmentInput): string {
  const themes =
    input.existingThemes.length > 0
      ? input.existingThemes
          .map((theme) => {
            const quotes = theme.quotes.slice(0, 2).map((quote) => `- « ${quote.slice(0, 160)} »`);
            return [
              `Thème ${theme.key} : ${theme.title}`,
              `Résumé : ${theme.problem}`,
              theme.backlogIssueId ? `Issue : ${theme.backlogIssueId}` : "Pas d'issue liée.",
              quotes.length > 0 ? `Citations :\n${quotes.join("\n")}` : "Pas de citation retenue.",
            ].join("\n");
          })
          .join("\n\n")
      : "Aucun thème déjà ouvert.";
  return [
    ATTACHMENT_RULES,
    "Thèmes déjà ouverts, à comparer un par un :",
    themes,
    "Backlog Linear :",
    input.backlog.map((issue) => `- ${issue.id} [${issue.statut}] ${issue.titre}`).join("\n") || "Aucun.",
    "Feedback à rattacher :",
    frameData(
      {
        id: input.feedback.id,
        type: input.classification.type,
        probleme: input.classification.underlyingProblem,
      },
      input.feedback.maskedText,
    ),
  ].join("\n\n");
}

/**
 * Un thème isolé n'est pas accepté si une comparaison dit que le problème existe déjà.
 * Sans lien explicite, le feedback rejoint ce thème. Avec un lien, le nouveau thème (souvent un bug) reste, rattaché au proche.
 */
export function resolveAttachment(proposal: AttachmentProposal, existingKeys: ReadonlySet<string>): ResolvedAttachment {
  const { comparisons, ...rest } = proposal;
  const same = comparisons.filter((item) => item.sameProblem && existingKeys.has(item.themeKey));
  const linked = rest.relatedThemeIds.filter((id) => existingKeys.has(id));
  const knownTarget = existingKeys.has(rest.themeKey);

  if (rest.action === "rattacher" && knownTarget) {
    return { ...rest, action: "rattacher", relatedThemeIds: linked, forced: false };
  }
  if (same.length > 0 && linked.length > 0 && rest.action === "creer") {
    return { ...rest, action: "creer", relatedThemeIds: linked, forced: false };
  }
  if (same.length > 0) {
    const target = same[0]!;
    return {
      ...rest,
      action: "rattacher",
      themeKey: target.themeKey,
      relatedThemeIds: [],
      forced: true,
      rationale: `${rest.rationale} Rattaché à « ${target.themeKey} » : même problème, pas de thème isolé. ${target.why}`,
    };
  }
  return { ...rest, action: "creer", relatedThemeIds: [], forced: rest.action !== "creer" };
}

export async function attachFeedback(
  input: AttachmentInput,
  provider: LlmProvider,
): Promise<{ grouped: GroupedTheme; attachment: FeedbackAttachment; warnings: string[] }> {
  const out = await provider.generate({
    task: "group",
    key: input.feedback.id,
    system: SYSTEM,
    prompt: buildAttachmentPrompt(input),
    schema: AttachmentLlmSchema,
    inputHash: hashOf({
      id: input.feedback.id,
      text: input.feedback.maskedText,
      type: input.classification.type,
      problem: input.classification.underlyingProblem,
      existing: input.existingThemes,
    }),
  });
  const existingKeys = new Set(input.existingThemes.map((theme) => theme.key));
  const warnings: string[] = [];
  const compared = new Set(out.comparisons.map((item) => item.themeKey));
  const missing = [...existingKeys].filter((key) => !compared.has(key));
  if (missing.length > 0) warnings.push(`Comparaison incomplète : ${missing.join(", ")}.`);

  const resolved = resolveAttachment(
    {
      action: out.decision.action,
      themeKey: out.decision.themeKey,
      title: out.decision.title,
      problem: out.decision.problem,
      rationale: out.decision.rationale,
      relatedThemeIds: out.decision.relatedThemeIds,
      comparisons: out.comparisons,
      backlogIssueId: out.decision.backlogIssueId,
      backlogRelation: out.decision.backlogRelation,
      quotes: out.decision.quotes,
    },
    existingKeys,
  );

  const backlogIds = new Set(input.backlog.map((issue) => issue.id));
  let backlogIssueId = resolved.backlogIssueId;
  if (backlogIssueId !== null && !backlogIds.has(backlogIssueId)) {
    warnings.push(`Thème ${resolved.themeKey} : issue ${backlogIssueId} absente du backlog, rapprochement retiré.`);
    backlogIssueId = null;
  }
  const quotes = checkQuotes(resolved.quotes, new Map([[input.feedback.id, input.feedback.maskedText]]));
  if (quotes.rejected.length > 0) warnings.push(`${quotes.rejected.length} citation(s) rejetée(s).`);

  const creating = resolved.action === "creer";
  return {
    warnings,
    attachment: {
      feedbackId: input.feedback.id,
      action: resolved.action,
      themeKey: resolved.themeKey,
      rationale: resolved.rationale,
      relatedThemeIds: resolved.relatedThemeIds,
      forced: resolved.forced,
    },
    grouped: {
      key: resolved.themeKey,
      title: resolved.title,
      problem: resolved.problem,
      feedbackIds: [input.feedback.id],
      relatedSignalIds: [],
      backlogIssueId: creating ? backlogIssueId : null,
      backlogRelation: creating && backlogIssueId !== null ? resolved.backlogRelation : "aucun",
      quotes: quotes.accepted,
      rejectedQuotes: quotes.rejected,
      ...(creating && resolved.relatedThemeIds.length > 0 ? { relatedThemeIds: resolved.relatedThemeIds } : {}),
      ...(creating ? { creationRationale: resolved.rationale } : {}),
    },
  };
}
