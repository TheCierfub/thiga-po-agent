import { describe, expect, it } from "vitest";
import {
  QUOTA_REACHED,
  allowMagicLink,
  limitsFor,
  quotaFor,
  reserveUsage,
  usageDay,
  type UsageCounter,
} from "./quota";

const limits = limitsFor({});
const story = quotaFor("story", limits);

function fill(userId: string, day: string, count: number): UsageCounter {
  return { userId, action: "story", day, count };
}

describe("quotas du jour", () => {
  it("refuse le compte qui a déjà ses 5 stories", () => {
    const day = "2026-11-10";
    const first = reserveUsage([fill("ada", day, 4)], { userId: "ada", action: "story", day, userLimit: story.user, globalLimit: story.global });
    expect(first.ok).toBe(true);
    const counters = first.ok ? first.counters : [];
    const blocked = reserveUsage(counters, { userId: "ada", action: "story", day, userLimit: story.user, globalLimit: story.global });
    expect(blocked).toEqual({ ok: false, status: 429, message: QUOTA_REACHED });
  });

  it("refuse tout le monde quand les 30 stories du jour sont prises", () => {
    const day = "2026-11-10";
    const counters = Array.from({ length: 6 }, (_, index) => fill(`user-${index}`, day, 5));
    expect(counters.reduce((sum, row) => sum + row.count, 0)).toBe(30);
    const blocked = reserveUsage(counters, { userId: "nouveau", action: "story", day, userLimit: story.user, globalLimit: story.global });
    expect(blocked).toEqual({ ok: false, status: 429, message: QUOTA_REACHED });
  });

  it("repart de zéro le jour suivant", () => {
    const yesterday = reserveUsage([fill("ada", "2026-11-10", 5)], {
      userId: "ada",
      action: "story",
      day: "2026-11-11",
      userLimit: story.user,
      globalLimit: story.global,
    });
    expect(yesterday.ok).toBe(true);
    expect(usageDay(new Date("2026-11-10T22:30:00.000Z"))).toBe("2026-11-10");
    expect(usageDay(new Date("2026-11-10T23:30:00.000Z"))).toBe("2026-11-11");
  });

  it("lit les variables QUOTA_* et retombe sur les défauts", () => {
    expect(limits).toMatchObject({ storyUser: 5, storyGlobal: 30, feedbackUser: 20, exportUser: 5, exportGlobal: 20 });
    expect(limitsFor({ QUOTA_EXPORT_PER_USER: "2", QUOTA_STORY_GLOBAL: "nope" }).exportUser).toBe(2);
    expect(limitsFor({ QUOTA_STORY_GLOBAL: "nope" }).storyGlobal).toBe(30);
    expect(quotaFor("feedback", limits).global).toBeNull();
  });
});

describe("envoi des liens", () => {
  it("bloque un e-mail et une adresse IP au-delà de la fenêtre", () => {
    const base = { emailLimit: 2, ipLimit: 3, windowMs: 60 * 60 * 1000 };
    let history: { email: string; ip: string; at: number }[] = [];
    const first = allowMagicLink({ ...base, email: "Ada@Acme.example", ip: "1.1.1.1", now: 0, history });
    expect(first.ok).toBe(true);
    history = first.history;
    history = allowMagicLink({ ...base, email: "ada@acme.example", ip: "1.1.1.1", now: 1, history }).history;
    const blockedEmail = allowMagicLink({ ...base, email: "ada@acme.example", ip: "8.8.8.8", now: 2, history });
    expect(blockedEmail.ok).toBe(false);
    const other = allowMagicLink({ ...base, email: "beau@acme.example", ip: "1.1.1.1", now: 3, history });
    expect(other.ok).toBe(true);
    history = other.history;
    const blockedIp = allowMagicLink({ ...base, email: "cleo@acme.example", ip: "1.1.1.1", now: 4, history });
    expect(blockedIp.ok).toBe(false);
    const later = allowMagicLink({ ...base, email: "ada@acme.example", ip: "1.1.1.1", now: base.windowMs + 10, history });
    expect(later.ok).toBe(true);
  });
});
