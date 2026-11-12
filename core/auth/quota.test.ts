import { describe, expect, it } from "vitest";
import { QUOTA_REACHED, limitsFor, quotaLimit, reserveGlobal, usageDay } from "./quota";

const limits = limitsFor({});

describe("plafond global du jour", () => {
  it("refuse au-delà de 30 stories, tous visiteurs confondus", () => {
    const day = "2026-11-10";
    const almost = reserveGlobal([], { action: "story", day, limit: limits.story });
    expect(almost.ok).toBe(true);
    let counters = almost.ok ? almost.counters : [];
    counters = [{ userId: "global", action: "story", day, count: 30 }];
    const blocked = reserveGlobal(counters, { action: "story", day, limit: limits.story });
    expect(blocked).toEqual({ ok: false, status: 429, message: QUOTA_REACHED });
  });

  it("plafonne les classifications à 200", () => {
    const day = "2026-11-10";
    expect(quotaLimit("feedback", limits)).toBe(200);
    const blocked = reserveGlobal([{ userId: "global", action: "feedback", day, count: 200 }], {
      action: "feedback",
      day,
      limit: limits.feedback,
    });
    expect(blocked.ok).toBe(false);
  });

  it("repart de zéro le jour suivant", () => {
    const next = reserveGlobal([{ userId: "global", action: "story", day: "2026-11-10", count: 30 }], {
      action: "story",
      day: "2026-11-11",
      limit: limits.story,
    });
    expect(next.ok).toBe(true);
    expect(usageDay(new Date("2026-11-10T22:30:00.000Z"))).toBe("2026-11-10");
    expect(usageDay(new Date("2026-11-10T23:30:00.000Z"))).toBe("2026-11-11");
  });

  it("lit QUOTA_* et retombe sur les défauts", () => {
    expect(limits).toEqual({ story: 30, feedback: 200, export: 20 });
    expect(limitsFor({ QUOTA_STORY_GLOBAL: "2", QUOTA_FEEDBACK_GLOBAL: "nope" }).story).toBe(2);
    expect(limitsFor({ QUOTA_FEEDBACK_GLOBAL: "nope" }).feedback).toBe(200);
  });
});
