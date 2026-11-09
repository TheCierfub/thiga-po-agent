import { z } from "zod";
import { SizeSchema } from "./context";

export const FEEDBACK_TYPES = [
  "bug",
  "demande",
  "friction",
  "question",
  "eloge",
  "signal_churn",
  "hors_sujet",
] as const;
export const FeedbackTypeSchema = z.enum(FEEDBACK_TYPES);
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

export const SeveritySchema = z.enum(["critique", "majeure", "mineure"]);
export type Severity = z.infer<typeof SeveritySchema>;

/** Sentiment d'un feedback. « indetermine » : confiance Jev sous 0,8, ou pas encore décidé. */
export const SENTIMENTS = ["positif", "neutre", "negatif", "frustre", "indetermine"] as const;
export const SentimentSchema = z.enum(SENTIMENTS);
export type Sentiment = z.infer<typeof SentimentSchema>;

/**
 * Sortie brute du LLM de classification. Champs tous requis (nullable plutôt qu'optionnel)
 * pour rester compatible avec les sorties structurées strictes des fournisseurs.
 */
export const ClassificationLlmSchema = z.object({
  type: FeedbackTypeSchema,
  severity: SeveritySchema.nullable().describe("Seulement pour un bug. null sinon."),
  injection: z.object({
    suspected: z.boolean(),
    excerpt: z
      .string()
      .nullable()
      .describe("Extrait exact du texte qui ressemble à une consigne adressée à l'agent."),
  }),
  underlyingProblem: z
    .string()
    .min(1)
    .describe("Le problème vécu par le client, pas la solution qu'il propose."),
  actionable: z
    .boolean()
    .describe("Faux si le texte est trop flou pour écrire une user story ou un ticket."),
  quotes: z
    .array(z.string().min(3))
    .max(3)
    .describe("Extraits copiés mot pour mot du texte, sans reformulation."),
});
export type ClassificationLlm = z.infer<typeof ClassificationLlmSchema>;

export const QuoteSchema = z.object({ feedbackId: z.string(), text: z.string() });
export type Quote = z.infer<typeof QuoteSchema>;

export const DECISION_STEPS = ["type", "injection", "critical", "backlog"] as const;
export const DecisionStepSchema = z.enum(DECISION_STEPS);
export type DecisionStep = z.infer<typeof DecisionStepSchema>;

/** Trace d'une décision prise hors de l'étape de texte (modèle de décision ou appel LLM dédié). */
export const DecisionTraceSchema = z.object({
  engine: z.string(),
  answer: z.string(),
  /** Probabilités renvoyées par le moteur, null s'il n'en donne pas (un LLM génératif). */
  probabilities: z.record(z.string(), z.number()).nullable(),
  confidence: z.number().nullable(),
  fallbackUsed: z.boolean(),
});
export type DecisionTrace = z.infer<typeof DecisionTraceSchema>;

export const FeedbackClassificationSchema = z.object({
  feedbackId: z.string(),
  type: FeedbackTypeSchema,
  severity: SeveritySchema.nullable(),
  underlyingProblem: z.string(),
  actionable: z.boolean(),
  injection: z.object({
    llmSuspected: z.boolean(),
    heuristicSignals: z.array(z.string()),
    quarantined: z.boolean(),
    releasedByPo: z.boolean(),
  }),
  quotes: z.array(QuoteSchema),
  rejectedQuotes: z.array(z.string()),
  /** Posé par Jev à l'ajout, ou par la fixture de démo au seed. Absent : indéterminé. */
  sentiment: SentimentSchema.optional(),
  decisions: z.partialRecord(DecisionStepSchema, DecisionTraceSchema).optional(),
  /** Choix de thème par le moteur de décision, à l'ajout direct seulement. */
  themeChoice: z
    .object({
      themeKey: z.string().nullable(),
      confidence: z.number().nullable(),
      probability: z.number().nullable(),
      probabilities: z.record(z.string(), z.number()).nullable(),
      fallbackUsed: z.boolean(),
      engine: z.string(),
    })
    .optional(),
});
export type FeedbackClassification = z.infer<typeof FeedbackClassificationSchema>;

export const BACKLOG_RELATIONS = ["doublon", "lie", "aucun"] as const;

export const GroupingLlmSchema = z.object({
  themes: z.array(
    z.object({
      key: z
        .string()
        .regex(/^[a-z0-9_]+$/)
        .describe("Identifiant stable en snake_case. Réutiliser la clé d'un thème existant."),
      title: z.string().min(3),
      problem: z.string().min(3).describe("Le problème commun, formulé côté client."),
      feedbackIds: z.array(z.string()).min(1),
      relatedSignalIds: z
        .array(z.string())
        .describe("Signaux de churn ou mentions secondaires qui citent ce problème."),
      backlogIssueId: z.string().nullable(),
      backlogRelation: z.enum(BACKLOG_RELATIONS),
      quotes: z.array(QuoteSchema).max(4),
    }),
  ),
});
export type GroupingLlm = z.infer<typeof GroupingLlmSchema>;

/** Décision de rattachement d'un seul feedback à des thèmes déjà ouverts. */
export const AttachmentLlmSchema = z.object({
  comparisons: z
    .array(
      z.object({
        themeKey: z.string(),
        sameProblem: z
          .boolean()
          .describe("Vrai si le feedback parle du même problème, même s'il décrit aussi un bug, une régression ou une autre solution."),
        why: z.string().min(8),
      }),
    )
    .describe("Une entrée par thème existant, avant toute création."),
  decision: z.object({
    action: z.enum(["rattacher", "creer"]),
    themeKey: z.string().regex(/^[a-z0-9_]+$/),
    title: z.string().min(3),
    problem: z.string().min(3),
    rationale: z.string().min(8),
    relatedThemeIds: z.array(z.string().regex(/^[a-z0-9_]+$/)),
    backlogIssueId: z.string().nullable(),
    backlogRelation: z.enum(BACKLOG_RELATIONS),
    quotes: z.array(QuoteSchema).max(4),
  }),
});
export type AttachmentLlm = z.infer<typeof AttachmentLlmSchema>;

export const FeedbackAttachmentSchema = z.object({
  feedbackId: z.string(),
  action: z.enum(["rattacher", "creer"]),
  themeKey: z.string(),
  rationale: z.string(),
  relatedThemeIds: z.array(z.string()),
  /** Vrai si le code a refusé un thème isolé et imposé le rattachement. */
  forced: z.boolean(),
  engine: z.string().optional(),
  confidence: z.number().nullable().optional(),
  probability: z.number().nullable().optional(),
});
export type FeedbackAttachment = z.infer<typeof FeedbackAttachmentSchema>;

export const TREND_KINDS = ["tendance", "recurrent", "ponctuel"] as const;
export const TrendSchema = z.object({
  kind: z.enum(TREND_KINDS),
  weeklyCounts: z.array(z.number().int().nonnegative()).length(4),
  rule: z.string(),
});
export type Trend = z.infer<typeof TrendSchema>;

export const ThemeSchema = z.object({
  key: z.string(),
  title: z.string(),
  problem: z.string(),
  kind: z.enum(["produit", "bug"]),
  feedbackIds: z.array(z.string()).min(1),
  relatedSignalIds: z.array(z.string()),
  backlogIssueId: z.string().nullable(),
  backlogRelation: z.enum(BACKLOG_RELATIONS),
  quotes: z.array(QuoteSchema),
  rejectedQuotes: z.array(QuoteSchema),
  trend: TrendSchema,
  hasCriticalBug: z.boolean(),
  firstSeenBatch: z.string(),
  backlogDecision: DecisionTraceSchema.optional(),
  /** Thèmes proches, quand celui-ci est un bug ou une facette d'un problème déjà ouvert. */
  relatedThemeIds: z.array(z.string()).optional(),
  /** Pourquoi ce thème a été créé plutôt que rattaché. Absent si le thème est ancien. */
  creationRationale: z.string().optional(),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const IMPACT_VALUES = [0.25, 0.5, 1, 2, 3] as const;
export const ImpactSchema = z.union([
  z.literal(0.25),
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type Impact = z.infer<typeof ImpactSchema>;

export const CONSTRAINT_KINDS = ["contrat", "securite", "coeur_casse"] as const;
export const ConstraintKindSchema = z.enum(CONSTRAINT_KINDS);
export type ConstraintKind = z.infer<typeof ConstraintKindSchema>;

export const THEME_CATEGORIES = ["bug", "amelioration", "nouvelle_fonctionnalite"] as const;
export const ThemeCategorySchema = z.enum(THEME_CATEGORIES);
export type ThemeCategory = z.infer<typeof ThemeCategorySchema>;

export const AssessmentLlmSchema = z.object({
  category: ThemeCategorySchema.describe(
    "bug : ce qui existe ne marche pas comme prévu. amelioration : rendre meilleure une fonction qui existe déjà. nouvelle_fonctionnalite : une capacité que le produit n'a pas aujourd'hui.",
  ),
  categoryRationale: z.string().min(3),
  impact: ImpactSchema,
  impactRationale: z.string().min(3),
  okrId: z.string().nullable(),
  effortSize: SizeSchema,
  referenceStoryId: z.string(),
  effortRationale: z.string().min(3),
  constraint: z
    .object({
      kind: ConstraintKindSchema,
      rationale: z.string().min(3),
      quote: QuoteSchema,
    })
    .nullable(),
  strategyFit: z.enum(["aligne", "neutre", "non_objectif"]),
  strategyRationale: z.string().min(3),
});
export type AssessmentLlm = z.infer<typeof AssessmentLlmSchema>;

export const ThemeAssessmentSchema = AssessmentLlmSchema.extend({
  themeKey: z.string(),
  /** « regle » : thème composé uniquement de bugs, catégorie imposée par le code. */
  categorySource: z.enum(["llm", "regle"]),
  constraintQuoteVerified: z.boolean(),
});
export type ThemeAssessment = z.infer<typeof ThemeAssessmentSchema>;

export const REACH_MODES = ["comptes", "volume", "arr"] as const;
export const ReachModeSchema = z.enum(REACH_MODES);
export type ReachMode = z.infer<typeof ReachModeSchema>;

export const RiceScoreSchema = z.object({
  themeKey: z.string(),
  reach: z.object({
    mode: ReachModeSchema,
    value: z.number().nonnegative(),
    accounts: z.array(z.string()),
    messages: z.number().int().nonnegative(),
    arr: z.number().nonnegative(),
    window: z.object({ start: z.iso.date(), end: z.iso.date() }),
    excluded: z.array(z.object({ feedbackId: z.string(), reason: z.string() })),
  }),
  impact: z.object({ value: ImpactSchema, source: z.enum(["llm", "po"]) }),
  confidence: z.object({
    value: z.union([z.literal(0.5), z.literal(0.8), z.literal(1)]),
    channels: z.array(z.string()),
    rule: z.string(),
  }),
  effort: z.object({ size: SizeSchema, points: z.number().positive(), source: z.enum(["llm", "po"]) }),
  score: z.number().nonnegative(),
});
export type RiceScore = z.infer<typeof RiceScoreSchema>;

export const MOSCOW_CLASSES = [
  "Must",
  "Should",
  "Could",
  "Won't",
  "À confirmer",
  "Hors arbitrage",
] as const;
export const MoscowClassSchema = z.enum(MOSCOW_CLASSES);
export type MoscowClass = z.infer<typeof MoscowClassSchema>;

export const MoscowDecisionSchema = z.object({
  themeKey: z.string(),
  moscow: MoscowClassSchema,
  reason: z.string().min(3),
  points: z.number().nonnegative(),
  cumulativePoints: z.number().nonnegative().nullable(),
  constraint: z
    .object({
      kind: ConstraintKindSchema,
      source: z.enum(["llm", "regle"]),
      confirmed: z.boolean(),
      confirmationStale: z.boolean(),
    })
    .nullable(),
});
export type MoscowDecision = z.infer<typeof MoscowDecisionSchema>;

export const AllocationSchema = z.object({
  arbitrablePoints: z.number().positive(),
  mustPoints: z.number().nonnegative(),
  shouldPoints: z.number().nonnegative(),
  couldPoints: z.number().nonnegative(),
  decisions: z.array(MoscowDecisionSchema),
  alerts: z.array(z.object({ code: z.string(), message: z.string() })),
});
export type Allocation = z.infer<typeof AllocationSchema>;
