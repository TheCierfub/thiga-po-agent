import type { RunResult } from "../pipeline/run";
import type { MoscowClass } from "../schemas";
import { num, pct, reachLabel } from "../report/format";

/** Clé stable d'un élément exporté : elle ne dépend que du thème, jamais du lot ni de l'heure. */
export function stableKey(themeKey: string): string {
  return `etai:${themeKey}`;
}

export interface BacklogItem {
  stableKey: string;
  themeKey: string;
  title: string;
  moscow: MoscowClass;
  existingIssueId: string | null;
  body: string;
  /** Raison du blocage : l'élément n'est pas exporté tant que le PO n'a pas tranché. */
  blocked: string | null;
}

export type SinkAction = "cree" | "mis_a_jour" | "inchange" | "bloque";

export interface SinkResult {
  stableKey: string;
  action: SinkAction;
  target: string | null;
  reason?: string;
}

export interface BacklogSink {
  readonly name: string;
  push(items: BacklogItem[]): Promise<SinkResult[]>;
}

const EXPORTED: MoscowClass[] = ["Must", "Should", "Could"];

/** Contenu déterministe, sans horodatage : deux exécutions identiques produisent le même texte. */
export function buildBacklogItems(result: RunResult): BacklogItem[] {
  const { state } = result;
  const themes = new Map(state.themes.map((t) => [t.key, t]));
  const rice = new Map(state.rice.map((r) => [r.themeKey, r]));
  const stories = new Map(state.stories.filter((s) => s.status === "brouillon").map((s) => [s.themeKey, s]));

  return state.allocation.decisions
    .filter((d) => EXPORTED.includes(d.moscow))
    .sort((a, b) => a.themeKey.localeCompare(b.themeKey))
    .map((d) => {
      const t = themes.get(d.themeKey)!;
      const r = rice.get(d.themeKey)!;
      const story = stories.get(d.themeKey);
      const body = [
        `# ${t.title}`,
        "",
        `MoSCoW : **${d.moscow}**. ${d.reason}`,
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
        ...(story
          ? [
              "## Story",
              "",
              `En tant que ${story.asA}, je veux ${story.iWant}, afin que ${story.soThat}.`,
              "",
              ...story.acceptanceCriteria.map((c) => `- Étant donné ${c.given}, quand ${c.when}, alors ${c.then}.`),
              "",
            ]
          : []),
        `Feedbacks : ${t.feedbackIds.join(", ")}.`,
        "",
      ].join("\n");
      return {
        stableKey: stableKey(d.themeKey),
        themeKey: d.themeKey,
        title: t.title,
        moscow: d.moscow,
        existingIssueId: t.backlogIssueId,
        body,
        blocked: d.constraint?.confirmationStale
          ? "Confirmation du PO donnée sur des preuves qui ont changé : à reconfirmer avant export."
          : null,
      };
    });
}
