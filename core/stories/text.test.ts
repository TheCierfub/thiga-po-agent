import { describe, expect, it } from "vitest";
import type { UserStoryDraft } from "../schemas";
import { renderStoryText, storyIssueSize, storyIssueTitle, storyText } from "./text";

const story = {
  title: "Partager un dossier",
  asA: "conducteur de travaux",
  iWant: "envoyer un lien",
  soThat: "le client voie l'avancement",
  acceptanceCriteria: [
    { given: "un dossier", when: "j'envoie", then: "il ouvre" },
    { given: "un lien", when: "il expire", then: "l'accès cesse" },
  ],
  size: "M",
  referenceStoryId: "LIN-1",
  sizeRationale: "proche d'une story déjà livrée",
  invest: {
    independent: { ok: true, note: "ok" },
    negotiable: { ok: true, note: "ok" },
    valuable: { ok: true, note: "ok" },
    estimable: { ok: true, note: "ok" },
    small: { ok: true, note: "ok" },
    testable: { ok: true, note: "ok" },
  },
  openQuestions: ["Quel délai ?"],
  outOfScope: [],
  themeKey: "partage_client",
  backlogIssueId: null,
  evidence: [],
  evidenceHash: "h",
  batch: "jeudi",
  status: "brouillon",
} satisfies UserStoryDraft;

describe("texte de story", () => {
  it("sérialise le titre, le récit, les critères et la complexité", () => {
    const text = renderStoryText(story);
    expect(text).toContain("# Partager un dossier");
    expect(text).toContain("En tant que conducteur de travaux, je veux envoyer un lien, afin que le client voie l'avancement.");
    expect(text).toContain("1. **Étant donné** un dossier, **quand** j'envoie, **alors** il ouvre.");
    expect(text).toContain("## Complexité relative");
    expect(text).toContain("M — proche d'une story déjà livrée");
    expect(text).not.toContain("INVEST");
  });

  it("l'export lit le texte édité, pas les champs d'origine", () => {
    const edited = {
      ...story,
      text: "# Lien client\n\nEn tant que Nadia, je veux relire, afin que l'issue parte telle quelle.\n\n## Complexité relative\n\nS — relu par la PO\n",
    };
    expect(storyText(edited)).toBe(edited.text);
    expect(storyIssueTitle(edited)).toBe("Lien client");
    expect(storyIssueSize(edited)).toBe("S");
  });
});
