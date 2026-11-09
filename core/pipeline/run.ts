import { loadBatchFile, loadContext, type BatchName, type Context } from "../data/load";
import type { PoDecisions } from "../decisions/po-decisions";
import { buildIdentityIndex, matchAuthor } from "../identity/match";
import { ingestBatch } from "../ingest/connectors";
import type { LlmProvider } from "../llm/provider";
import { maskFeedback } from "../privacy/mask";
import type {
  Account,
  AuthorMatch,
  BacklogIssue,
  Feedback,
  FeedbackClassification,
  InvestigationDraft,
  MaskedFeedback,
  MoscowClass,
  ReachMode,
  RiceScore,
  Strategy,
  Theme,
  ThemeAssessment,
  UserStoryDraft,
} from "../schemas";
import { allocateMoscow, type AllocationItem } from "../scoring/moscow";
import { computeConfidence, computeReach, computeRice } from "../scoring/rice";
import { computeTrend } from "../scoring/trend";
import { windowEndingOn, type Window } from "../scoring/window";
import { assumptionsHash, evidenceHash, planInvalidation, type InvalidationPlan } from "../state/invalidation";
import { assessTheme } from "../steps/assess";
import { classifyAll, isRelatedSignal, isThemeEligible, needsInvestigation } from "../steps/classify";
import { draftStory } from "../steps/draft-story";
import { groupThemes, type GroupedTheme } from "../steps/group";
import { draftInvestigation } from "../steps/investigate";
import { decideBacklog } from "../steps/decide";
import type { DecisionPlan } from "../llm/profiles";
import type { RunState } from "./state";

export interface RunOptions {
  root: string;
  batch: BatchName;
  provider: LlmProvider;
  reachMode: ReachMode;
  decisions: PoDecisions;
  previous: RunState | null;
  /** Rédiger la story du premier élément retenu (défaut : oui). */
  draftStory?: boolean;
  /** Étapes de décision confiées à un moteur dédié. Absentes : décidées dans les réponses de texte. */
  decider?: DecisionPlan;
}

/** Même avancement que runBatch, à partir de feedbacks déjà normalisés (fichier ou saisie). */
export interface AdvanceOptions {
  batch: string;
  referenceDate: string;
  incoming: Feedback[];
  provider: LlmProvider;
  reachMode: ReachMode;
  decisions: PoDecisions;
  previous: RunState | null;
  context: Context;
  draftStory?: boolean;
  decider?: DecisionPlan;
  /**
   * Le compte indiqué par le PO compte dans le Reach quand l'auteur n'est pas déjà rapproché
   * avec certitude. Réservé à la saisie directe : les fichiers de lot ne l'activent pas.
   */
  trustDeclaredAccount?: boolean;
}

export interface ThemeChange {
  key: string;
  title: string;
  status: "nouveau" | "preuves_modifiees" | "hypotheses_modifiees" | "inchange";
  newFeedbackIds: string[];
  accountsAdded: string[];
  accountsRemoved: { accountId: string; reason: string }[];
  riceBefore: number | null;
  riceAfter: number;
  confidenceBefore: number | null;
  confidenceAfter: number;
  moscowBefore: MoscowClass | null;
  moscowAfter: MoscowClass;
  reasonAfter: string;
}

export interface ChangeReport {
  previousBatch: string;
  plan: InvalidationPlan;
  themes: ThemeChange[];
  newQuarantines: string[];
  newInvestigations: string[];
}

export interface RunResult {
  state: RunState;
  newFeedbackIds: string[];
  story: UserStoryDraft | null;
  changes: ChangeReport | null;
  accounts: ReadonlyMap<string, Account>;
  backlog: BacklogIssue[];
  strategy: Strategy;
}

const CLASS_RANK: Record<MoscowClass, number> = {
  Must: 0,
  Should: 1,
  Could: 2,
  "À confirmer": 3,
  "Hors arbitrage": 4,
  "Won't": 5,
};

/** Le nom et le pseudo public restent : les brouillons de réponse s'adressent à l'auteur. */
function stripPii(feedback: MaskedFeedback): MaskedFeedback {
  return { ...feedback, text: feedback.maskedText, author: { ...feedback.author, email: null } };
}

function buildTheme(
  grouped: GroupedTheme,
  firstSeenBatch: string,
  classifications: ReadonlyMap<string, FeedbackClassification>,
  feedbacks: ReadonlyMap<string, MaskedFeedback>,
  window: Window,
): Theme {
  const members = grouped.feedbackIds.map((id) => classifications.get(id)!);
  return {
    key: grouped.key,
    title: grouped.title,
    problem: grouped.problem,
    kind: members.length > 0 && members.every((c) => c.type === "bug") ? "bug" : "produit",
    feedbackIds: grouped.feedbackIds,
    relatedSignalIds: grouped.relatedSignalIds,
    backlogIssueId: grouped.backlogIssueId,
    backlogRelation: grouped.backlogRelation,
    quotes: grouped.quotes,
    rejectedQuotes: grouped.rejectedQuotes,
    trend: computeTrend(
      grouped.feedbackIds.map((id) => feedbacks.get(id)!.receivedAt),
      window,
    ),
    hasCriticalBug: members.some((c) => c.type === "bug" && c.severity === "critique"),
    firstSeenBatch,
    ...(grouped.backlogDecision ? { backlogDecision: grouped.backlogDecision } : {}),
  };
}

function mergeThemes(previous: Theme[], grouped: GroupedTheme[]): { merged: GroupedTheme[]; firstSeen: Map<string, string> } {
  const byKey = new Map<string, GroupedTheme>(
    previous.map((t) => [
      t.key,
      {
        key: t.key,
        title: t.title,
        problem: t.problem,
        feedbackIds: [...t.feedbackIds],
        relatedSignalIds: [...t.relatedSignalIds],
        backlogIssueId: t.backlogIssueId,
        backlogRelation: t.backlogRelation,
        quotes: [...t.quotes],
        rejectedQuotes: [...t.rejectedQuotes],
        ...(t.backlogDecision ? { backlogDecision: t.backlogDecision } : {}),
      },
    ]),
  );
  const firstSeen = new Map(previous.map((t) => [t.key, t.firstSeenBatch]));
  for (const g of grouped) {
    const existing = byKey.get(g.key);
    if (!existing) {
      byKey.set(g.key, g);
      continue;
    }
    existing.feedbackIds.push(...g.feedbackIds.filter((id) => !existing.feedbackIds.includes(id)));
    existing.relatedSignalIds.push(...g.relatedSignalIds.filter((id) => !existing.relatedSignalIds.includes(id)));
    if (existing.backlogIssueId === null && g.backlogIssueId !== null) {
      existing.backlogIssueId = g.backlogIssueId;
      existing.backlogRelation = g.backlogRelation;
    }
    existing.quotes.push(...g.quotes);
    existing.rejectedQuotes.push(...g.rejectedQuotes);
  }
  return { merged: [...byKey.values()], firstSeen };
}

export async function runBatch(options: RunOptions): Promise<RunResult> {
  const file = loadBatchFile(options.root, options.batch);
  return advanceRun({
    batch: options.batch,
    referenceDate: file.fenetre.fin,
    incoming: ingestBatch(file),
    provider: options.provider,
    reachMode: options.reachMode,
    decisions: options.decisions,
    previous: options.previous,
    context: loadContext(options.root),
    draftStory: options.draftStory,
    decider: options.decider,
  });
}

export async function advanceRun(options: AdvanceOptions): Promise<RunResult> {
  const { batch, provider, reachMode, decisions, previous, context } = options;
  const { strategy, backlog } = context;
  const accounts = new Map(context.accounts.map((a) => [a.id, a]));
  const backlogById = new Map(backlog.map((i) => [i.id, i]));
  const window = windowEndingOn(options.referenceDate);
  const warnings: string[] = [];

  // 1. Masquage avant tout appel LLM, rapprochement. Seuls les feedbacks inconnus sont traités.
  const incoming = options.incoming.map(maskFeedback);
  const known = new Set(previous?.feedbacks.map((f) => f.id) ?? []);
  const fresh = incoming.filter((f) => !known.has(f.id));
  const index = buildIdentityIndex(context.accounts);
  const freshMatches: AuthorMatch[] = fresh.map((f) => {
    const match = matchAuthor(f, index);
    if (
      options.trustDeclaredAccount &&
      match.confidence !== "certaine" &&
      f.sourceAccountId !== null &&
      accounts.has(f.sourceAccountId)
    ) {
      const account = accounts.get(f.sourceAccountId)!;
      return {
        feedbackId: f.id,
        accountId: account.id,
        candidateAccountId: null,
        confidence: "certaine",
        method: "saisie_po",
        explanation: `Compte indiqué par le PO : ${account.nom}.`,
        sourceDisagreement: false,
      };
    }
    return match;
  });
  for (const m of freshMatches) {
    if (m.sourceDisagreement) warnings.push(`${m.feedbackId} : le compte déclaré par la source diffère du rapprochement.`);
  }

  // 2. Classification des seuls nouveaux feedbacks.
  const decider = options.decider ?? {};
  const freshClassifications = await classifyAll(fresh, provider, decisions.releasedFromQuarantine, decider);
  for (const c of freshClassifications) {
    if (c.rejectedQuotes.length > 0) warnings.push(`${c.feedbackId} : ${c.rejectedQuotes.length} citation(s) rejetée(s).`);
  }

  const feedbacks = new Map<string, MaskedFeedback>([
    ...(previous?.feedbacks ?? []).map((f) => [f.id, f] as const),
    ...fresh.map((f) => [f.id, f] as const),
  ]);
  const matches = new Map<string, AuthorMatch>([
    ...(previous?.matches ?? []).map((m) => [m.feedbackId, m] as const),
    ...freshMatches.map((m) => [m.feedbackId, m] as const),
  ]);
  const classifications = new Map<string, FeedbackClassification>([
    ...(previous?.classifications ?? []).map((c) => [c.feedbackId, c] as const),
    ...freshClassifications.map((c) => [c.feedbackId, c] as const),
  ]);

  // 3. Regroupement des nouveaux feedbacks, avec les thèmes déjà ouverts.
  const pair = (c: FeedbackClassification) => ({ feedback: feedbacks.get(c.feedbackId)!, classification: c });
  const members = freshClassifications.filter(isThemeEligible).map(pair);
  const signals = freshClassifications.filter(isRelatedSignal).map(pair);
  const grouping =
    members.length + signals.length > 0
      ? await groupThemes(
          {
            batch,
            members,
            signals,
            backlog,
            existingThemes: (previous?.themes ?? []).map((t) => ({
              key: t.key,
              title: t.title,
              problem: t.problem,
              backlogIssueId: t.backlogIssueId,
            })),
          },
          provider,
        )
      : { themes: [], unassigned: [], warnings: [] };
  warnings.push(...grouping.warnings);

  // Rattachement au backlog par un moteur dédié : seulement pour les thèmes nouveaux,
  // un thème déjà ouvert garde son rattachement.
  if (decider.backlog) {
    const known = new Set((previous?.themes ?? []).map((t) => t.key));
    for (const g of grouping.themes.filter((t) => !known.has(t.key))) {
      const excerpts = [...g.feedbackIds, ...g.relatedSignalIds].slice(0, 8).map((id) => feedbacks.get(id)!.maskedText.slice(0, 600));
      const d = await decideBacklog({ batch, key: g.key, title: g.title, problem: g.problem, excerpts }, backlog, decider.backlog);
      g.backlogIssueId = d.backlogIssueId;
      g.backlogRelation = d.backlogRelation;
      g.backlogDecision = d.trace;
    }
  }

  const { merged, firstSeen } = mergeThemes(previous?.themes ?? [], grouping.themes);
  const themes = merged
    .filter((g) => g.feedbackIds.length > 0)
    .map((g) => buildTheme(g, firstSeen.get(g.key) ?? batch, classifications, feedbacks, window));

  // 4. Invalidation : qu'est-ce qui dépend de preuves ou d'hypothèses modifiées ?
  const overrideOf = (key: string) => decisions.overrides.find((o) => o.themeKey === key);
  const evidence = Object.fromEntries(themes.map((t) => [t.key, evidenceHash(t)]));
  const assumptions = Object.fromEntries(
    themes.map((t) => [
      t.key,
      assumptionsHash({ override: overrideOf(t.key) ?? null, reachMode, capacity: strategy.capacity, sizes: strategy.sizePoints }),
    ]),
  );
  const previousConfirmations = Object.fromEntries(
    decisions.confirmedConstraints
      .filter((c) => previous && c.batch === previous.batch && previous.evidence[c.themeKey])
      .map((c) => [c.themeKey, previous!.evidence[c.themeKey]!]),
  );
  const plan = previous
    ? planInvalidation(
        {
          evidence: previous.evidence,
          assumptions: previous.assumptions,
          stories: Object.fromEntries(
            previous.stories.filter((s) => s.status === "brouillon").map((s) => [s.themeKey, s.evidenceHash]),
          ),
          confirmations: previousConfirmations,
        },
        evidence,
        assumptions,
      )
    : null;

  // 5. Évaluation LLM des seuls thèmes nouveaux ou modifiés.
  const previousAssessments = new Map((previous?.assessments ?? []).map((a) => [a.themeKey, a]));
  const toAssess = new Set(plan ? plan.reassess : themes.map((t) => t.key));
  const assessments = new Map<string, ThemeAssessment>();
  for (const theme of themes) {
    const reuse = previousAssessments.get(theme.key);
    if (!toAssess.has(theme.key) && reuse) {
      assessments.set(theme.key, reuse);
      continue;
    }
    const assessment = await assessTheme(
      {
        batch,
        theme,
        feedbacks,
        strategy,
        backlogIssue: theme.backlogIssueId ? (backlogById.get(theme.backlogIssueId) ?? null) : null,
      },
      provider,
    );
    if (assessment.constraint && !assessment.constraintQuoteVerified) {
      warnings.push(`${theme.key} : contrainte proposée sans citation vérifiable, ignorée.`);
    }
    assessments.set(theme.key, assessment);
  }

  // 6. RICE, toujours recalculé.
  const rice = new Map<string, RiceScore>();
  for (const theme of themes) {
    const a = assessments.get(theme.key)!;
    const override = overrideOf(theme.key);
    const { channels, ...reach } = computeReach({
      feedbackIds: theme.feedbackIds,
      feedbacks,
      matches,
      accounts,
      window,
      mode: reachMode,
    });
    rice.set(
      theme.key,
      computeRice({
        themeKey: theme.key,
        reach,
        confidence: computeConfidence(reach.accounts.length, channels),
        impact: override?.impact ? { value: override.impact, source: "po" } : { value: a.impact, source: "llm" },
        effort: override?.effortSize
          ? { size: override.effortSize, source: "po" }
          : { size: a.effortSize, source: "llm" },
        strategy,
      }),
    );
  }

  // 7. MoSCoW.
  const staleConfirmations = new Set(plan?.staleConfirmations ?? []);
  const items: AllocationItem[] = themes.map((theme) => {
    const a = assessments.get(theme.key)!;
    const r = rice.get(theme.key)!;
    const llmConstraint = a.constraint && a.constraintQuoteVerified ? a.constraint.kind : null;
    const kind = llmConstraint ?? (theme.hasCriticalBug ? "coeur_casse" : null);
    const confirmation = decisions.confirmedConstraints.find((c) => c.themeKey === theme.key);
    const issue = theme.backlogIssueId ? backlogById.get(theme.backlogIssueId) : undefined;
    const committed =
      issue && (strategy.capacity.committedIssueIds.includes(issue.id) || issue.statut === "En cours") ? issue.id : null;
    return {
      themeKey: theme.key,
      points: r.effort.points,
      rice: r.score,
      arr: r.reach.arr,
      confidence: r.confidence.value,
      strategyFit: a.strategyFit,
      committedIssueId: committed,
      constraint: kind
        ? {
            kind,
            source: llmConstraint ? "llm" : "regle",
            confirmed: confirmation !== undefined,
            rejected: decisions.rejectedConstraints.some((c) => c.themeKey === theme.key),
            confirmationStale: confirmation !== undefined && confirmation.batch !== batch && staleConfirmations.has(theme.key),
          }
        : null,
    };
  });
  const allocation = allocateMoscow(items, strategy);
  for (const c of decisions.confirmedConstraints) {
    if (!themes.some((t) => t.key === c.themeKey)) {
      warnings.push(`Confirmation du PO pour « ${c.themeKey} » sans thème correspondant dans ce lot.`);
    }
  }

  // 8. Rédaction à la demande : le premier élément retenu qui n'est pas un bug.
  const decisionsByKey = new Map(allocation.decisions.map((d) => [d.themeKey, d]));
  const themeByKey = new Map(themes.map((t) => [t.key, t]));
  const target = allocation.decisions
    .filter((d) => (["Must", "Should", "Could"] as MoscowClass[]).includes(d.moscow))
    .filter((d) => themeByKey.get(d.themeKey)?.kind === "produit")
    .sort((a, b) => CLASS_RANK[a.moscow] - CLASS_RANK[b.moscow] || rice.get(b.themeKey)!.score - rice.get(a.themeKey)!.score)[0];

  const staleStoryKeys = new Set(plan?.staleStories ?? []);
  const stories: UserStoryDraft[] = (previous?.stories ?? []).map((s) =>
    staleStoryKeys.has(s.themeKey) ? { ...s, status: "obsolete" } : s,
  );
  let story: UserStoryDraft | null = null;
  if (target && options.draftStory !== false) {
    const reusable = stories.find((s) => s.themeKey === target.themeKey && s.status === "brouillon");
    if (reusable) {
      story = reusable;
    } else {
      const theme = themeByKey.get(target.themeKey)!;
      story = await draftStory(
        {
          batch,
          theme,
          assessment: assessments.get(theme.key)!,
          rice: rice.get(theme.key)!,
          decision: decisionsByKey.get(theme.key)!,
          feedbacks,
          strategy,
          backlogIssue: theme.backlogIssueId ? (backlogById.get(theme.backlogIssueId) ?? null) : null,
          evidenceHash: evidence[theme.key]!,
        },
        provider,
      );
      stories.push(story);
    }
  }

  // 9. Investigation des feedbacks trop flous.
  const investigations: InvestigationDraft[] = [...(previous?.investigations ?? [])];
  const newInvestigations: string[] = [];
  for (const c of freshClassifications.filter(needsInvestigation)) {
    investigations.push(await draftInvestigation(feedbacks.get(c.feedbackId)!, c, provider));
    newInvestigations.push(c.feedbackId);
  }

  const state: RunState = {
    version: 1,
    batch,
    referenceDate: options.referenceDate,
    reachMode,
    feedbacks: [...feedbacks.values()].map(stripPii),
    matches: [...matches.values()],
    classifications: [...classifications.values()],
    themes,
    assessments: [...assessments.values()],
    rice: [...rice.values()],
    allocation,
    evidence,
    assumptions,
    stories,
    investigations,
    warnings,
  };

  let changes: ChangeReport | null = null;
  if (previous && plan) {
    const prevRice = new Map(previous.rice.map((r) => [r.themeKey, r]));
    const prevDecision = new Map(previous.allocation.decisions.map((d) => [d.themeKey, d]));
    const prevThemes = new Map(previous.themes.map((t) => [t.key, t]));
    const statusOf = (key: string): ThemeChange["status"] =>
      plan.newThemes.includes(key)
        ? "nouveau"
        : plan.changedEvidence.includes(key)
          ? "preuves_modifiees"
          : plan.changedAssumptions.includes(key)
            ? "hypotheses_modifiees"
            : "inchange";
    changes = {
      previousBatch: previous.batch,
      plan,
      newQuarantines: freshClassifications.filter((c) => c.injection.quarantined).map((c) => c.feedbackId),
      newInvestigations,
      themes: themes
        .map((t): ThemeChange => {
          const before = prevRice.get(t.key);
          const after = rice.get(t.key)!;
          const prevIds = new Set(prevThemes.get(t.key)?.feedbackIds ?? []);
          const removed = (before?.reach.accounts ?? []).filter((a) => !after.reach.accounts.includes(a));
          return {
            key: t.key,
            title: t.title,
            status: statusOf(t.key),
            newFeedbackIds: t.feedbackIds.filter((id) => !prevIds.has(id)),
            accountsAdded: after.reach.accounts.filter((a) => !(before?.reach.accounts ?? []).includes(a)),
            accountsRemoved: removed.map((accountId) => ({
              accountId,
              reason: `plus aucun message dans la fenêtre du ${window.start} au ${window.end}`,
            })),
            riceBefore: before?.score ?? null,
            riceAfter: after.score,
            confidenceBefore: before?.confidence.value ?? null,
            confidenceAfter: after.confidence.value,
            moscowBefore: prevDecision.get(t.key)?.moscow ?? null,
            moscowAfter: decisionsByKey.get(t.key)!.moscow,
            reasonAfter: decisionsByKey.get(t.key)!.reason,
          };
        })
        .sort((a, b) => CLASS_RANK[a.moscowAfter] - CLASS_RANK[b.moscowAfter] || b.riceAfter - a.riceAfter),
    };
  }

  return {
    state,
    newFeedbackIds: fresh.map((f) => f.id),
    story,
    changes,
    accounts,
    backlog,
    strategy,
  };
}
