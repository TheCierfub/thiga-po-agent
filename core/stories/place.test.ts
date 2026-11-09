import { describe, expect, it } from "vitest";
import type { UserStoryDraft } from "../schemas";
import { byNewest, editStory, engagedEffortLabel, feedbackReference, placeStory } from "./place";

const story = {
  title: "Partager un dossier",
  asA: "conducteur de travaux",
  iWant: "envoyer un lien",
  soThat: "le client voie l'avancement",
  acceptanceCriteria: [{ given: "un dossier", when: "j'envoie", then: "il ouvre" }, { given: "un lien", when: "il expire", then: "l'accès cesse" }],
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

describe("stories à la demande", () => {
  it("remplace la story du thème et garde les autres", () => {
    const other = { ...story, themeKey: "notifications", title: "Alertes" };
    const edited = editStory(story, {
      title: "Lien client",
      asA: "Nadia",
      iWant: "relire avant d'envoyer",
      soThat: "l'issue parte telle quelle",
      acceptanceCriteria: story.acceptanceCriteria,
      size: "S",
    });
    const placed = placeStory([story, other], edited);
    expect(placed.find((item) => item.themeKey === "partage_client")).toMatchObject({
      title: "Lien client",
      iWant: "relire avant d'envoyer",
      size: "S",
      editedByPo: true,
      status: "brouillon",
    });
    expect(placed.find((item) => item.themeKey === "notifications")?.title).toBe("Alertes");
  });

  it("trie les feedbacks du plus récent au plus ancien", () => {
    expect(byNewest([
      { id: "a", receivedAt: "2026-10-28T18:00:00+01:00" },
      { id: "b", receivedAt: "2026-11-06T09:00:00+01:00" },
    ]).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("écrit une référence lisible et nomme un thème déjà engagé", () => {
    expect(feedbackReference("2026-10-28T18:22:00+01:00", "E-mail", "Linteau")).toMatch(/^28 oct\. · E-mail · Linteau$/);
    expect(engagedEffortLabel("Hors arbitrage", "LIN-52")).toBe("Déjà engagé (LIN-52)");
    expect(engagedEffortLabel("Should", "LIN-52")).toBeNull();
    expect(engagedEffortLabel("Hors arbitrage", null)).toBeNull();
  });
});
