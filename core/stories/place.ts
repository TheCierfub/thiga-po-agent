import type { UserStoryDraft } from "../schemas";

export interface StoryEdits {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: { given: string; when: string; then: string }[];
  size: UserStoryDraft["size"];
}

/** Remplace toute story de ce thème par le brouillon courant. */
export function placeStory(stories: readonly UserStoryDraft[], story: UserStoryDraft): UserStoryDraft[] {
  return [...stories.filter((item) => item.themeKey !== story.themeKey), story];
}

export function editStory(story: UserStoryDraft, edits: StoryEdits): UserStoryDraft {
  return {
    ...story,
    title: edits.title.trim(),
    asA: edits.asA.trim(),
    iWant: edits.iWant.trim(),
    soThat: edits.soThat.trim(),
    acceptanceCriteria: edits.acceptanceCriteria.map((criterion) => ({
      given: criterion.given.trim(),
      when: criterion.when.trim(),
      then: criterion.then.trim(),
    })),
    size: edits.size,
    status: "brouillon",
    editedByPo: true,
  };
}

export function storyEdits(story: UserStoryDraft): StoryEdits {
  return {
    title: story.title,
    asA: story.asA,
    iWant: story.iWant,
    soThat: story.soThat,
    acceptanceCriteria: story.acceptanceCriteria.map((criterion) => ({ ...criterion })),
    size: story.size,
  };
}

/** « 28 oct. · E-mail · Linteau ». L'identifiant brut reste à part. */
export function feedbackReference(receivedAt: string, channelLabel: string, who: string): string {
  const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(receivedAt));
  return `${when} · ${channelLabel} · ${who}`;
}

/** « 6 nov. 2026 ». Le mois est toujours écrit. */
export function feedbackDate(receivedAt: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(receivedAt));
}

export function byNewest<T extends { receivedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function excerpt(text: string, max = 110): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
}

/** Libellé d'effort quand le thème est déjà dans la capacité engagée. */
export function engagedEffortLabel(moscow: string, issueId: string | null): string | null {
  if (moscow !== "Hors arbitrage" || !issueId) return null;
  return `Déjà engagé (${issueId})`;
}
