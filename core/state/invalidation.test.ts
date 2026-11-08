import { describe, expect, it } from "vitest";
import { evidenceHash, planInvalidation } from "./invalidation";

const theme = (key: string, feedbackIds: string[], backlogIssueId: string | null = null) => ({
  key,
  feedbackIds,
  relatedSignalIds: [],
  backlogIssueId,
});

describe("empreinte des preuves", () => {
  it("ne dépend pas de l'ordre des feedbacks", () => {
    expect(evidenceHash(theme("a", ["2", "1"]))).toBe(evidenceHash(theme("a", ["1", "2"])));
  });
  it("change si un feedback rejoint le thème ou si l'issue liée change", () => {
    const base = evidenceHash(theme("a", ["1"]));
    expect(evidenceHash(theme("a", ["1", "2"]))).not.toBe(base);
    expect(evidenceHash(theme("a", ["1"], "LIN-27"))).not.toBe(base);
  });
});

describe("plan d'invalidation", () => {
  const notif = evidenceHash(theme("notifications", ["l8", "l14"]));
  const notifJeudi = evidenceHash(theme("notifications", ["l8", "l14", "j1"]));
  const epingle = evidenceHash(theme("epingle", ["l7"]));

  it("réévalue les thèmes nouveaux ou modifiés, garde les autres", () => {
    const plan = planInvalidation(
      { evidence: { notifications: notif, epingle }, assumptions: { notifications: "h", epingle: "h" }, stories: {}, confirmations: {} },
      { notifications: notifJeudi, epingle, notes: "n" },
      { notifications: "h", epingle: "h", notes: "h" },
    );
    expect(plan.changedEvidence).toEqual(["notifications"]);
    expect(plan.newThemes).toEqual(["notes"]);
    expect(plan.unchanged).toEqual(["epingle"]);
    expect(plan.reassess).toEqual(["notes", "notifications"]);
  });

  it("rend obsolètes la story et la confirmation dont les preuves ont changé", () => {
    const plan = planInvalidation(
      {
        evidence: { notifications: notif, epingle },
        assumptions: { notifications: "h", epingle: "h" },
        stories: { notifications: notif, epingle },
        confirmations: { notifications: notif },
      },
      { notifications: notifJeudi, epingle },
      { notifications: "h", epingle: "h" },
    );
    expect(plan.staleStories).toEqual(["notifications"]);
    expect(plan.staleConfirmations).toEqual(["notifications"]);
  });

  it("rend une story obsolète si une hypothèse du PO change, sans nouvelle preuve", () => {
    const plan = planInvalidation(
      { evidence: { epingle }, assumptions: { epingle: "avant" }, stories: { epingle }, confirmations: {} },
      { epingle },
      { epingle: "après" },
    );
    expect(plan.changedAssumptions).toEqual(["epingle"]);
    expect(plan.reassess).toEqual([]);
    expect(plan.staleStories).toEqual(["epingle"]);
  });
});
