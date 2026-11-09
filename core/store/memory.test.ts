import { describe, expect, it } from "vitest";
import { EMPTY_PO_DECISIONS } from "../decisions/po-decisions";
import { NO_OVERRIDES } from "../scoring/overrides";
import { MemoryStore } from "./memory";
import { feedbackToRow, rowToFeedback } from "./rows";
import { StoreError } from "./types";

const feedback = {
  id: "fb-direct-test",
  batch: "jeudi" as const,
  channel: "ticket_support" as const,
  receivedAt: "2026-11-06T18:00:00+01:00",
  author: { name: "Camille Herry", email: "camille.herry@rivage-promo.example", handle: null, anonymous: false },
  sourceAccountId: "acc-rivage",
  language: "fr" as const,
  text: "Le réglage des notifications par rôle manque toujours.",
};

describe("stockage en mémoire", () => {
  it("relit les horodatages d'un post X après écriture", () => {
    const social = {
      ...feedback,
      id: "fb-x-1851",
      channel: "social" as const,
      author: { name: "@quai17", email: null, handle: "@quai17", anonymous: false },
      sourceAccountId: "x:@quai17",
      sourceUrl: "https://x.com/i/web/status/1851",
      listening: {
        publishedAt: "2026-11-09T18:50:00.000Z",
        detectedAt: "2026-11-09T18:51:00.000Z",
        processedAt: "2026-11-09T18:51:02.000Z",
      },
    };
    expect(rowToFeedback(feedbackToRow(social, "direct")).feedback.listening).toEqual(social.listening);
  });

  it("conserve le feedback brut, y compris l'e-mail, et le relit via le schéma", () => {
    const row = feedbackToRow(feedback, "direct");
    expect(row.body).toBe(feedback.text);
    expect(row.received_at_raw).toBe(feedback.receivedAt);
    expect(rowToFeedback(row)).toEqual({ feedback, origin: "direct" });
  });

  it("enregistre l'analyse et les arbitrages, et le seed efface les ajouts directs", async () => {
    const store = new MemoryStore();
    await store.upsertFeedbacks([{ feedback, origin: "direct" }]);
    await store.saveRun({
      state: {
        version: 1,
        batch: "jeudi",
        referenceDate: "2026-11-06",
        reachMode: "comptes",
        feedbacks: [],
        matches: [],
        classifications: [],
        themes: [],
        assessments: [],
        rice: [],
        allocation: { arbitrablePoints: 16, mustPoints: 0, shouldPoints: 0, couldPoints: 0, decisions: [], alerts: [] },
        evidence: {},
        assumptions: {},
        stories: [],
        investigations: [],
        warnings: [],
      },
      newFeedbackIds: [feedback.id],
      changes: null,
    });
    await store.saveArbitrages("jeudi", {
      decisions: EMPTY_PO_DECISIONS,
      overrides: { effort: { notifications: "S" }, forced: { partage_client: { moscow: "Won't", motif: "Hors cycle." } } },
    });

    expect((await store.listFeedbacks("jeudi")).map((row) => row.origin)).toEqual(["direct"]);
    expect((await store.getRun("jeudi"))?.newFeedbackIds).toEqual([feedback.id]);
    expect((await store.getArbitrages("jeudi"))?.overrides.forced.partage_client?.moscow).toBe("Won't");

    await store.resetDemo({
      feedbacks: [{ ...feedback, id: "fb-jeudi-01", text: "Corpus de départ." }],
      runs: [],
      arbitrages: [{ batch: "jeudi", value: { decisions: EMPTY_PO_DECISIONS, overrides: NO_OVERRIDES } }],
    });
    const left = await store.listFeedbacks();
    expect(left.map((row) => [row.feedback.id, row.origin])).toEqual([["fb-jeudi-01", "seed"]]);
    expect(await store.getRun("jeudi")).toBeNull();
    expect((await store.getArbitrages("jeudi"))?.overrides).toEqual(NO_OVERRIDES);
  });

  it("refuse une analyse qui ne respecte pas le schéma", async () => {
    const store = new MemoryStore();
    await expect(
      store.saveRun({
        state: { version: 1 } as never,
        newFeedbackIds: [],
        changes: null,
      }),
    ).rejects.toBeInstanceOf(StoreError);
  });
});
