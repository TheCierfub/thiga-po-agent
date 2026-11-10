import type { Allocation, MoscowClass, Strategy } from "../schemas";
import { allocateMoscow, type AllocationItem } from "../scoring/moscow";
import type { RunState } from "../pipeline/state";
import type { CapacityFreed, LinearExport } from "../schemas";

const RANK: Record<MoscowClass, number> = {
  Must: 0,
  Should: 1,
  Could: 2,
  "À confirmer": 3,
  "Hors arbitrage": 4,
  "Won't": 5,
};

export interface RecordedIssue {
  id: string;
  identifier: string;
  url: string;
}

/** Identifiant qui sort le thème de l'arbitrage : l'export, sinon le backlog déjà engagé. */
export function committedIssueOf(
  theme: { linearExport?: { identifier: string }; backlogIssueId: string | null },
  issue: { id: string; statut: string } | undefined,
  committedIssueIds: readonly string[],
): string | null {
  if (theme.linearExport?.identifier) return theme.linearExport.identifier;
  if (issue && (committedIssueIds.includes(issue.id) || issue.statut === "En cours")) return issue.id;
  return null;
}

function reallocate(state: RunState, strategy: Strategy): Allocation {
  const before = new Map(state.allocation.decisions.map((decision) => [decision.themeKey, decision]));
  const rice = new Map(state.rice.map((score) => [score.themeKey, score]));
  const assessments = new Map(state.assessments.map((assessment) => [assessment.themeKey, assessment]));
  const items: AllocationItem[] = state.themes.map((theme) => {
    const score = rice.get(theme.key)!;
    const assessment = assessments.get(theme.key);
    const decision = before.get(theme.key);
    return {
      themeKey: theme.key,
      points: score.effort.points,
      rice: score.score,
      arr: score.reach.arr,
      confidence: score.confidence.value,
      strategyFit: assessment?.strategyFit ?? "neutre",
      constraint: decision?.constraint ? { ...decision.constraint, rejected: false } : null,
      committedIssueId: committedIssueOf(theme, undefined, strategy.capacity.committedIssueIds)
        ?? (decision?.moscow === "Hors arbitrage" ? (theme.backlogIssueId ?? "engagé") : null),
    };
  });
  return allocateMoscow(items, strategy);
}

/**
 * Mémorise l'issue sur le thème, le sort de l'arbitrage et recalcule le lot.
 * Les points du thème ne comptent plus : un autre thème peut monter.
 */
export function recordThemeExport(
  state: RunState,
  themeKey: string,
  issue: RecordedIssue,
  strategy: Strategy,
  exportedAt: string,
): { state: RunState; rises: CapacityFreed["rises"] } {
  const theme = state.themes.find((item) => item.key === themeKey);
  if (!theme) return { state, rises: [] };
  const members = [...theme.feedbackIds, ...theme.relatedSignalIds.filter((id) => !theme.feedbackIds.includes(id))];
  const linearExport: LinearExport = {
    id: issue.id,
    identifier: issue.identifier,
    url: issue.url,
    exportedAt,
    feedbackIds: members,
    comments: theme.linearExport?.comments ?? [],
    pending: theme.linearExport?.pending ?? [],
  };
  const withExport: RunState = {
    ...state,
    themes: state.themes.map((item) => (item.key === themeKey ? { ...item, linearExport } : item)),
  };
  const before = new Map(state.allocation.decisions.map((decision) => [decision.themeKey, decision.moscow]));
  const allocation = reallocate(withExport, strategy);
  const rises = allocation.decisions.flatMap((decision) => {
    if (decision.themeKey === themeKey) return [];
    const from = before.get(decision.themeKey);
    if (!from || RANK[decision.moscow] >= RANK[from]) return [];
    const title = state.themes.find((item) => item.key === decision.themeKey)?.title ?? decision.themeKey;
    return [{ key: decision.themeKey, title, from, to: decision.moscow }];
  });
  const event: CapacityFreed = { themeKey, title: theme.title, identifier: issue.identifier, rises };
  return {
    state: {
      ...withExport,
      allocation,
      ...(rises.length > 0 ? { capacityFreed: [...(state.capacityFreed ?? []), event] } : {}),
    },
    rises,
  };
}
