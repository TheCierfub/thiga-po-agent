import { SIZES, type Size, type UserStoryDraft } from "../schemas";

/** Texte lisible que la PO édite, puis que l'export envoie tel quel. */
export function renderStoryText(story: Pick<UserStoryDraft, "title" | "asA" | "iWant" | "soThat" | "acceptanceCriteria" | "size" | "sizeRationale">): string {
  const criteria = story.acceptanceCriteria
    .map((criterion, index) => `${index + 1}. **Étant donné** ${criterion.given}, **quand** ${criterion.when}, **alors** ${criterion.then}.`)
    .join("\n");
  return [
    `# ${story.title}`,
    "",
    `En tant que ${story.asA}, je veux ${story.iWant}, afin que ${story.soThat}.`,
    "",
    "## Critères d'acceptation",
    "",
    criteria,
    "",
    "## Complexité relative",
    "",
    `${story.size} — ${story.sizeRationale}`,
    "",
  ].join("\n");
}

export function storyText(story: UserStoryDraft): string {
  const written = story.text?.trim();
  return written ? story.text! : renderStoryText(story);
}

/** Titre d'issue : le titre écrit dans le texte, sinon celui rendu par le modèle. */
export function storyIssueTitle(story: UserStoryDraft): string {
  const text = storyText(story);
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading && heading.length >= 3) return heading;
  const line = text
    .split("\n")
    .map((item) => item.trim())
    .find(Boolean);
  if (line && line.length >= 3) return line.replace(/^#+\s*/, "");
  return story.title;
}

/** Taille lue dans « Complexité relative », sinon celle du modèle. Sert à l'estimation Linear. */
export function storyIssueSize(story: UserStoryDraft): Size {
  const section = storyText(story).split(/## Complexité relative/i)[1] ?? "";
  const match = section.match(/\b(XS|XL|S|M|L)\b/);
  if (match && (SIZES as readonly string[]).includes(match[1]!)) return match[1] as Size;
  return story.size;
}
