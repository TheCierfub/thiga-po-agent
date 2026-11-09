import { checkQuotes } from "../evidence/quotes";
import { COMPANY_CONTEXT, DATA_BOUNDARY_RULES, frameData } from "../llm/prompts";
import type { LlmProvider } from "../llm/provider";
import {
  GroupingLlmSchema,
  type BacklogIssue,
  type DecisionTrace,
  type FeedbackClassification,
  type MaskedFeedback,
  type Quote,
} from "../schemas";
import { hashOf } from "../util/hash";

const SYSTEM = `${COMPANY_CONTEXT}

Tâche : regrouper des feedbacks en thèmes centrés sur le problème du client.
- Deux feedbacks qui proposent des solutions différentes au même problème vont dans le même thème (export PDF, lien en lecture seule et portail client peuvent décrire un seul problème : montrer l'avancement au client).
- Un même feedback n'appartient qu'à un thème.
- Les bugs d'une même cause vont ensemble ; ne mélange pas un bug et une demande dans un thème.
- Rapproche chaque thème d'une issue du backlog existant si elle traite le même problème. backlogRelation vaut « doublon » si l'issue décrit la même solution, « lie » si elle traite le problème autrement, « aucun » sinon.
- Si des thèmes existants sont fournis, réutilise leur clé quand un nouveau feedback les rejoint. Ne crée un thème que pour un problème nouveau.
- Les signaux de churn ne sont pas des membres : cite-les dans relatedSignalIds du thème dont ils parlent.
- Chaque thème porte une à quatre citations exactes, tirées de ses feedbacks.

${DATA_BOUNDARY_RULES}`;

export interface ExistingTheme {
  key: string;
  title: string;
  problem: string;
  backlogIssueId: string | null;
}

export interface GroupingInput {
  batch: string;
  members: { feedback: MaskedFeedback; classification: FeedbackClassification }[];
  signals: { feedback: MaskedFeedback; classification: FeedbackClassification }[];
  backlog: BacklogIssue[];
  existingThemes: ExistingTheme[];
}

export interface GroupedTheme {
  key: string;
  title: string;
  problem: string;
  feedbackIds: string[];
  relatedSignalIds: string[];
  backlogIssueId: string | null;
  backlogRelation: "doublon" | "lie" | "aucun";
  quotes: Quote[];
  rejectedQuotes: Quote[];
  backlogDecision?: DecisionTrace;
  relatedThemeIds?: string[];
  creationRationale?: string;
}

export interface GroupingResult {
  themes: GroupedTheme[];
  unassigned: string[];
  warnings: string[];
}

function inputForHash(input: GroupingInput) {
  return {
    members: input.members.map(({ feedback, classification }) => ({
      id: feedback.id,
      type: classification.type,
      problem: classification.underlyingProblem,
      text: feedback.maskedText,
    })),
    signals: input.signals.map(({ feedback }) => ({ id: feedback.id, text: feedback.maskedText })),
    backlog: input.backlog.map((i) => ({ id: i.id, titre: i.titre, statut: i.statut })),
    existing: input.existingThemes,
  };
}

export async function groupThemes(input: GroupingInput, provider: LlmProvider): Promise<GroupingResult> {
  const block = (items: GroupingInput["members"], role: string) =>
    items
      .map(({ feedback, classification }) =>
        frameData(
          {
            id: feedback.id,
            role,
            type: classification.type,
            probleme: classification.underlyingProblem,
          },
          feedback.maskedText,
        ),
      )
      .join("\n\n");

  const prompt = [
    "Backlog Linear existant :",
    input.backlog.map((i) => `- ${i.id} [${i.statut}] ${i.titre} — ${i.description}`).join("\n"),
    input.existingThemes.length > 0
      ? `Thèmes déjà ouverts (réutiliser la clé) :\n${input.existingThemes
          .map((t) => `- ${t.key} : ${t.title}. ${t.problem}${t.backlogIssueId ? ` (${t.backlogIssueId})` : ""}`)
          .join("\n")}`
      : "Aucun thème déjà ouvert.",
    "Feedbacks à regrouper :",
    block(input.members, "membre"),
    input.signals.length > 0 ? `Signaux de churn (à citer, pas à regrouper) :\n${block(input.signals, "signal")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await provider.generate({
    task: "group",
    key: input.batch,
    system: SYSTEM,
    prompt,
    schema: GroupingLlmSchema,
    inputHash: hashOf(inputForHash(input)),
  });

  const memberIds = new Set(input.members.map((m) => m.feedback.id));
  const signalIds = new Set(input.signals.map((s) => s.feedback.id));
  const backlogIds = new Set(input.backlog.map((i) => i.id));
  const textById = new Map(
    [...input.members, ...input.signals].map(({ feedback }) => [feedback.id, feedback.maskedText]),
  );
  const assigned = new Set<string>();
  const warnings: string[] = [];
  const themes: GroupedTheme[] = [];

  for (const t of out.themes) {
    const feedbackIds = t.feedbackIds.filter((id) => {
      if (!memberIds.has(id)) {
        warnings.push(`Thème ${t.key} : ${id} n'est pas un feedback regroupable, ignoré.`);
        return false;
      }
      if (assigned.has(id)) {
        warnings.push(`Thème ${t.key} : ${id} déjà rangé dans un autre thème, ignoré.`);
        return false;
      }
      assigned.add(id);
      return true;
    });
    const relatedSignalIds = t.relatedSignalIds.filter((id) => signalIds.has(id));
    if (feedbackIds.length === 0 && relatedSignalIds.length === 0) {
      warnings.push(`Thème ${t.key} sans feedback valide, écarté.`);
      continue;
    }
    let backlogIssueId = t.backlogIssueId;
    if (backlogIssueId !== null && !backlogIds.has(backlogIssueId)) {
      warnings.push(`Thème ${t.key} : issue ${backlogIssueId} absente du backlog, rapprochement retiré.`);
      backlogIssueId = null;
    }
    const scope = new Map(
      [...feedbackIds, ...relatedSignalIds].map((id) => [id, textById.get(id) ?? ""] as const),
    );
    const quotes = checkQuotes(t.quotes, scope);
    if (quotes.rejected.length > 0) {
      warnings.push(`Thème ${t.key} : ${quotes.rejected.length} citation(s) rejetée(s), absente(s) du texte source.`);
    }
    themes.push({
      key: t.key,
      title: t.title,
      problem: t.problem,
      feedbackIds,
      relatedSignalIds,
      backlogIssueId,
      backlogRelation: backlogIssueId === null ? "aucun" : t.backlogRelation,
      quotes: quotes.accepted,
      rejectedQuotes: quotes.rejected,
    });
  }

  const unassigned = [...memberIds].filter((id) => !assigned.has(id)).sort();
  if (unassigned.length > 0) warnings.push(`Feedbacks non regroupés : ${unassigned.join(", ")}.`);
  return { themes, unassigned, warnings };
}
