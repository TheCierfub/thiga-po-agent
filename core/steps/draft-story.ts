import { COMPANY_CONTEXT, DATA_BOUNDARY_RULES, frameData } from "../llm/prompts";
import type { LlmProvider } from "../llm/provider";
import {
  UserStoryLlmSchema,
  type BacklogIssue,
  type MaskedFeedback,
  type MoscowDecision,
  type RiceScore,
  type Strategy,
  type Theme,
  type ThemeAssessment,
  type UserStoryDraft,
} from "../schemas";
import { renderStoryText } from "../stories/text";
import { hashOf } from "../util/hash";

const SYSTEM = `${COMPANY_CONTEXT}

Tâche : rédiger une user story prête à être discutée avec l'équipe.
- Format : En tant que… je veux… afin de…
- Deux à six critères d'acceptation en Given / When / Then (rédigés en français : Étant donné / Quand / Alors), vérifiables.
- Taille XS à XL, comparée à une story de référence déjà livrée.
- Auto-diagnostic INVEST honnête : si un critère n'est pas tenu, dis-le.
- Questions ouvertes pour les développeurs, et ce qui est hors périmètre.
- La story porte sur le problème du thème. Si des clients demandent des choses contradictoires, la story règle la contradiction plutôt que de choisir un camp.

${DATA_BOUNDARY_RULES}`;

export interface DraftStoryInput {
  batch: string;
  theme: Theme;
  assessment: ThemeAssessment;
  rice: RiceScore;
  decision: MoscowDecision;
  feedbacks: ReadonlyMap<string, MaskedFeedback>;
  strategy: Strategy;
  backlogIssue: BacklogIssue | null;
  evidenceHash: string;
}

export async function draftStory(input: DraftStoryInput, provider: LlmProvider): Promise<UserStoryDraft> {
  const { theme, strategy } = input;
  const evidence = theme.feedbackIds.map((id) => input.feedbacks.get(id)!).filter(Boolean);
  const prompt = [
    `Thème « ${theme.title} » : ${theme.problem}`,
    `Décision : ${input.decision.moscow} — ${input.decision.reason}`,
    `Taille proposée à l'évaluation : ${input.rice.effort.size} (référence ${input.assessment.referenceStoryId}). ${input.assessment.effortRationale}`,
    input.backlogIssue
      ? `Issue existante à enrichir : ${input.backlogIssue.id} — ${input.backlogIssue.titre}. ${input.backlogIssue.description}`
      : "Pas d'issue existante : la story en créera une.",
    `Stories de référence :\n${strategy.referenceStories.map((s) => `- ${s.id} (${s.size}) : ${s.title}`).join("\n")}`,
    `Citations vérifiées :\n${theme.quotes.map((q) => `- ${q.feedbackId} : « ${q.text} »`).join("\n")}`,
    "Feedbacks du thème :",
    evidence.map((f) => frameData({ id: f.id, canal: f.channel }, f.maskedText)).join("\n\n"),
  ].join("\n\n");

  const out = await provider.generate({
    task: "story",
    key: `${input.batch}--${theme.key}`,
    system: SYSTEM,
    prompt,
    schema: UserStoryLlmSchema,
    inputHash: hashOf({ evidenceHash: input.evidenceHash, size: input.rice.effort.size, moscow: input.decision.moscow }),
  });

  if (!strategy.referenceStories.some((s) => s.id === out.referenceStoryId)) {
    throw new Error(`Story ${theme.key} : story de référence inconnue ${out.referenceStoryId}.`);
  }

  const story = {
    ...out,
    themeKey: theme.key,
    backlogIssueId: theme.backlogIssueId,
    evidence: theme.quotes,
    evidenceHash: input.evidenceHash,
    batch: input.batch,
    status: "brouillon" as const,
  };
  return { ...story, text: renderStoryText(story) };
}
