import { renderFeedbackSources } from "../export/sources";
import type { RunResult } from "../pipeline/run";
import type { MoscowClass, Quote, Size, ThemeCategory } from "../schemas";
import { CATEGORY_LABEL, num, pct, reachLabel } from "../report/format";
import { storyIssueSize, storyIssueTitle, storyText } from "../stories/text";

/** Clé stable d'un élément exporté : elle ne dépend que du thème, jamais du lot ni de l'heure. */
export function stableKey(themeKey: string): string {
  return `etai:${themeKey}`;
}

export interface BacklogItem {
  stableKey: string;
  themeKey: string;
  title: string;
  moscow: MoscowClass;
  category: ThemeCategory;
  existingIssueId: string | null;
  body: string;
  /** Raison du blocage : l'élément n'est pas exporté tant que le PO n'a pas tranché. */
  blocked: string | null;
  /** Données structurées pour les outils qui en ont l'usage (estimation, demandes clients). */
  details: BacklogItemDetails;
}

export interface BacklogItemDetails {
  /** Taille de la story si elle existe, sinon taille retenue pour le RICE. */
  size: Size;
  points: number;
  hasStory: boolean;
  feedbackIds: string[];
  quotes: Quote[];
  /** Comptes qui portent le thème, avec leurs propres feedbacks et citations. */
  customers: { accountId: string; name: string; feedbackIds: string[]; quotes: string[] }[];
}

export interface BuildOptions {
  /** Lien vers un feedback, ajouté à la description quand il est fourni. */
  feedbackUrl?: (feedbackId: string) => string;
  /** Limite l'export à ces thèmes. */
  themeKeys?: readonly string[];
}

export type SinkAction = "cree" | "mis_a_jour" | "inchange" | "bloque";

export interface SinkResult {
  stableKey: string;
  action: SinkAction;
  target: string | null;
  /** UUID Linear, pour un commentaire ultérieur. */
  issueId?: string;
  reason?: string;
  url?: string;
  notes?: string[];
}

export interface BacklogSink {
  readonly name: string;
  push(items: BacklogItem[]): Promise<SinkResult[]>;
}

const EXPORTED: MoscowClass[] = ["Must", "Should", "Could"];

/** Contenu déterministe, sans horodatage : deux exécutions identiques produisent le même texte. */
export function buildBacklogItems(result: Pick<RunResult, "state" | "accounts" | "strategy">, options: BuildOptions = {}): BacklogItem[] {
  const { state } = result;
  const themes = new Map(state.themes.map((t) => [t.key, t]));
  const rice = new Map(state.rice.map((r) => [r.themeKey, r]));
  const categories = new Map(state.assessments.map((a) => [a.themeKey, a.category]));
  const stories = new Map(state.stories.filter((s) => s.status === "brouillon").map((s) => [s.themeKey, s]));
  const accountOf = new Map(state.matches.map((m) => [m.feedbackId, m.accountId]));
  const link = (id: string) => (options.feedbackUrl ? `[${id}](${options.feedbackUrl(id)})` : id);

  return state.allocation.decisions
    .filter((d) => EXPORTED.includes(d.moscow))
    .filter((d) => !options.themeKeys || options.themeKeys.includes(d.themeKey))
    .sort((a, b) => a.themeKey.localeCompare(b.themeKey))
    .map((d) => {
      const t = themes.get(d.themeKey)!;
      const r = rice.get(d.themeKey)!;
      const story = stories.get(d.themeKey);
      const category = categories.get(d.themeKey)!;
      const composed = [
        `# ${t.title}`,
        "",
        `Catégorie : **${CATEGORY_LABEL[category]}**. MoSCoW : **${d.moscow}**. ${d.reason}`,
        "",
        "## Problème",
        "",
        t.problem,
        "",
        "## Score",
        "",
        `RICE ${num(r.score, 3)} = ${reachLabel(r.reach)} × impact ${num(r.impact.value)} × confidence ${pct(r.confidence.value)} ÷ ${num(r.effort.points)} pt (${r.effort.size}).`,
        "",
        "## Citations",
        "",
        ...t.quotes.map((q) => `- ${q.feedbackId} : « ${q.text} »`),
        "",
        `Feedbacks : ${t.feedbackIds.map(link).join(", ")}.`,
        "",
      ].join("\n");
      const sourceIds = [...t.feedbackIds, ...t.relatedSignalIds.filter((id) => !t.feedbackIds.includes(id))];
      const sources = renderFeedbackSources({
        feedbackIds: sourceIds,
        feedbacks: state.feedbacks,
        quotes: t.quotes,
        accountName: (id) => {
          const accountId = accountOf.get(id);
          return accountId ? (result.accounts.get(accountId)?.nom ?? null) : null;
        },
      });
      const body = story ? `${storyText(story).trimEnd()}\n\n${sources}` : `${composed.trimEnd()}\n\n${sources}`;
      const size = story ? storyIssueSize(story) : r.effort.size;
      const customers = r.reach.accounts.map((accountId) => {
        const feedbackIds = t.feedbackIds.filter((id) => accountOf.get(id) === accountId);
        return {
          accountId,
          name: result.accounts.get(accountId)?.nom ?? accountId,
          feedbackIds,
          quotes: t.quotes.filter((q) => feedbackIds.includes(q.feedbackId)).map((q) => q.text),
        };
      });
      return {
        stableKey: stableKey(d.themeKey),
        themeKey: d.themeKey,
        title: story ? storyIssueTitle(story) : t.title,
        moscow: d.moscow,
        category,
        existingIssueId: t.backlogIssueId,
        body,
        blocked: d.constraint?.confirmationStale
          ? "Confirmation du PO donnée sur des preuves qui ont changé : à reconfirmer avant export."
          : null,
        details: {
          size,
          points: result.strategy.sizePoints[size],
          hasStory: story !== undefined,
          feedbackIds: t.feedbackIds,
          quotes: t.quotes,
          customers,
        },
      };
    });
}
