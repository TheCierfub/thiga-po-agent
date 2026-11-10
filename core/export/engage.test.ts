import { describe, expect, it } from "vitest";
import { allocateMoscow } from "../scoring/moscow";
import type { RunState } from "../pipeline/state";
import type { Strategy, Theme } from "../schemas";
import { recordThemeExport } from "./engage";
import { renderFeedbackSources } from "./sources";

const strategy = {
  capacity: {
    grossPoints: 8,
    committedIssueIds: [],
    committedPoints: 0,
    mustAlertRatio: 0.6,
    shouldLineRatio: 0.8,
    couldBudgetRatio: 0.2,
  },
} as unknown as Strategy;

function theme(key: string): Theme {
  return {
    key,
    title: key,
    problem: key,
    kind: "produit",
    feedbackIds: [`fb-${key}`],
    relatedSignalIds: [],
    backlogIssueId: null,
    backlogRelation: "aucun",
    quotes: [],
    rejectedQuotes: [],
    trend: { kind: "ponctuel", weeklyCounts: [0, 0, 0, 1], rule: "un message" },
    hasCriticalBug: false,
    firstSeenBatch: "jeudi",
  } as Theme;
}

function score(key: string, points: number, rice: number) {
  return {
    themeKey: key,
    score: rice,
    effort: { points },
    reach: { arr: 1, accounts: ["a"] },
    confidence: { value: 1 },
  };
}

describe("export enregistré", () => {
  it("mémorise THI-xx, sort le thème de l'arbitrage et fait monter l'autre", () => {
    const themes = [theme("gros"), theme("petit")];
    const rice = [score("gros", 6, 9), score("petit", 4, 4)];
    const before = allocateMoscow(
      [
        { themeKey: "gros", points: 6, rice: 9, arr: 1, confidence: 1, strategyFit: "neutre", constraint: { kind: "contrat", source: "llm", confirmed: true, rejected: false, confirmationStale: false }, committedIssueId: null },
        { themeKey: "petit", points: 4, rice: 4, arr: 1, confidence: 1, strategyFit: "neutre", constraint: null, committedIssueId: null },
      ],
      strategy,
    );
    expect(before.decisions.find((item) => item.themeKey === "petit")?.moscow).toBe("Won't");
    const state = { themes, rice, assessments: [], allocation: before } as unknown as RunState;
    const recorded = recordThemeExport(state, "gros", { id: "uuid-1", identifier: "THI-20", url: "https://linear.app/thiga/issue/THI-20" }, strategy, "2026-11-10T12:00:00.000Z");
    const exported = recorded.state.themes.find((item) => item.key === "gros")?.linearExport;
    expect(exported).toMatchObject({ identifier: "THI-20", url: "https://linear.app/thiga/issue/THI-20", feedbackIds: ["fb-gros"] });
    expect(recorded.state.allocation.decisions.find((item) => item.themeKey === "gros")?.moscow).toBe("Hors arbitrage");
    expect(recorded.state.allocation.decisions.find((item) => item.themeKey === "petit")?.moscow).toBe("Should");
    expect(recorded.rises).toEqual([{ key: "petit", title: "petit", from: "Won't", to: "Should" }]);
    expect(recorded.state.capacityFreed?.[0]?.identifier).toBe("THI-20");
  });

  it("un thème du corpus n'est pas exporté", () => {
    expect(theme("gros").linearExport).toBeUndefined();
  });
});

describe("description de l'issue", () => {
  it("liste l'entreprise, le canal, la date et une citation", () => {
    const text = renderFeedbackSources({
      feedbackIds: ["fb-1"],
      feedbacks: [{ id: "fb-1", channel: "email", receivedAt: "2026-11-06T08:00:00+01:00", author: { name: "Aude", email: null, handle: null, anonymous: false }, maskedText: "les notes internes partent au client", text: "x", batch: "jeudi", language: "fr", sourceAccountId: null, pii: [] } as never],
      quotes: [{ feedbackId: "fb-1", text: "notes internes" }],
      accountName: () => "Vigie Contrôle",
    });
    expect(text).toContain("## Feedbacks sources");
    expect(text).toContain("**Vigie Contrôle** · E-mail ·");
    expect(text).toContain("notes internes");
  });
});
