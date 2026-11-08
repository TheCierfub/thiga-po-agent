import { isExactQuote } from "../evidence/quotes";
import { COMPANY_CONTEXT, DATA_BOUNDARY_RULES, frameData } from "../llm/prompts";
import type { LlmProvider } from "../llm/provider";
import {
  AssessmentLlmSchema,
  type BacklogIssue,
  type MaskedFeedback,
  type Strategy,
  type Theme,
  type ThemeAssessment,
} from "../schemas";
import { hashOf } from "../util/hash";

const SYSTEM = `${COMPANY_CONTEXT}

Tâche : proposer, pour un thème, les hypothèses que le PO validera. Tu ne calcules aucun score : le code s'en charge.
- category : bug (ce qui existe ne marche pas comme prévu), amelioration (rendre meilleure une fonction qui existe
  déjà : réglage, ergonomie, extension) ou nouvelle_fonctionnalite (une capacité que le produit n'a pas aujourd'hui).
  Juge d'après le produit décrit et le backlog, pas d'après le vocabulaire du client.
- impact : 0.25 (minime), 0.5 (faible), 1 (moyen), 2 (fort), 3 (massif), relié à un OKR quand c'est le cas.
- effortSize : XS, S, M, L ou XL, en comparant à une story de référence déjà livrée (referenceStoryId).
- constraint : seulement si le thème relève d'une contrainte qui impose un Must indépendamment du volume :
  clause de contrat signée, exigence de sécurité, ou cœur du produit cassé. Cite l'extrait exact qui le prouve. null sinon.
- strategyFit : non_objectif si le thème correspond à un non-objectif du trimestre, aligne s'il sert un OKR, neutre sinon.

${DATA_BOUNDARY_RULES}`;

export interface AssessInput {
  batch: string;
  theme: Theme;
  feedbacks: ReadonlyMap<string, MaskedFeedback>;
  strategy: Strategy;
  backlogIssue: BacklogIssue | null;
}

export async function assessTheme(input: AssessInput, provider: LlmProvider): Promise<ThemeAssessment> {
  const { theme, strategy } = input;
  const evidenceIds = [...theme.feedbackIds, ...theme.relatedSignalIds];
  const evidence = evidenceIds.map((id) => {
    const f = input.feedbacks.get(id);
    if (!f) throw new Error(`Feedback inconnu : ${id}`);
    return f;
  });

  const prompt = [
    `Thème « ${theme.title} » (${theme.key}). Problème : ${theme.problem}`,
    `Nature : ${theme.kind === "bug" ? "bugs" : "demandes et frictions"}. Tendance : ${theme.trend.kind}.`,
    input.backlogIssue
      ? `Issue liée : ${input.backlogIssue.id} [${input.backlogIssue.statut}] ${input.backlogIssue.titre}, estimée ${input.backlogIssue.estimation}.`
      : "Aucune issue liée dans le backlog.",
    `OKR du trimestre :\n${strategy.okrs.map((o) => `- ${o.id} : ${o.title}. ${o.keyResult}`).join("\n")}`,
    `Non-objectifs :\n${strategy.nonGoals.map((n) => `- ${n}`).join("\n")}`,
    `Stories de référence :\n${strategy.referenceStories.map((s) => `- ${s.id} (${s.size}) : ${s.title}`).join("\n")}`,
    "Preuves :",
    evidence
      .map((f) => frameData({ id: f.id, canal: f.channel, date: f.receivedAt.slice(0, 10) }, f.maskedText))
      .join("\n\n"),
  ].join("\n\n");

  const out = await provider.generate({
    task: "assess",
    key: `${input.batch}--${theme.key}`,
    system: SYSTEM,
    prompt,
    schema: AssessmentLlmSchema,
    inputHash: hashOf({
      theme: { key: theme.key, problem: theme.problem, kind: theme.kind, backlogIssueId: theme.backlogIssueId },
      evidence: evidence.map((f) => ({ id: f.id, text: f.maskedText })),
      okrs: strategy.okrs,
      nonGoals: strategy.nonGoals,
      references: strategy.referenceStories,
    }),
  });

  const okrId = out.okrId !== null && strategy.okrs.some((o) => o.id === out.okrId) ? out.okrId : null;
  if (!strategy.referenceStories.some((s) => s.id === out.referenceStoryId)) {
    throw new Error(`Évaluation ${theme.key} : story de référence inconnue ${out.referenceStoryId}.`);
  }
  const quoteText = out.constraint ? (input.feedbacks.get(out.constraint.quote.feedbackId)?.maskedText ?? "") : "";
  const constraintQuoteVerified =
    out.constraint !== null &&
    evidenceIds.includes(out.constraint.quote.feedbackId) &&
    isExactQuote(out.constraint.quote.text, quoteText);

  const category =
    theme.kind === "bug"
      ? { category: "bug" as const, categoryRationale: "Tous les feedbacks du thème sont des bugs.", categorySource: "regle" as const }
      : { categorySource: "llm" as const };
  return { ...out, ...category, okrId, themeKey: theme.key, constraintQuoteVerified };
}
