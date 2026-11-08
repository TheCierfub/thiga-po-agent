import { describe, expect, it } from "vitest";
import { STRATEGY } from "../test/helpers";
import { allocateMoscow, type AllocationItem } from "./moscow";

const item = (over: Partial<AllocationItem> & { themeKey: string }): AllocationItem => ({
  points: 2,
  rice: 1,
  arr: 0,
  confidence: 1,
  strategyFit: "aligne",
  constraint: null,
  committedIssueId: null,
  ...over,
});

const must = (themeKey: string, points: number, kind: "contrat" | "coeur_casse" = "contrat") =>
  item({
    themeKey,
    points,
    rice: 0.1,
    confidence: 0.5,
    constraint: { kind, source: "llm", confirmed: true, rejected: false, confirmationStale: false },
  });

const classOf = (alloc: ReturnType<typeof allocateMoscow>, key: string) =>
  alloc.decisions.find((d) => d.themeKey === key)?.moscow;

describe("MoSCoW DSDM", () => {
  it("met une contrainte confirmée en Must, même avec un RICE faible", () => {
    const alloc = allocateMoscow([must("sso", 6), item({ themeKey: "x", rice: 9 })], STRATEGY);
    expect(classOf(alloc, "sso")).toBe("Must");
    expect(alloc.mustPoints).toBe(6);
  });

  it("n'alerte pas à 60 % pile, alerte au-delà", () => {
    const capacity = 16;
    const atLine = allocateMoscow([must("a", 0.6 * capacity)], STRATEGY);
    expect(atLine.alerts.map((a) => a.code)).not.toContain("MUST_AU_DELA_DE_60");
    const over = allocateMoscow([must("a", 6), must("b", 4, "coeur_casse")], STRATEGY);
    expect(over.mustPoints).toBe(10);
    expect(over.alerts.map((a) => a.code)).toContain("MUST_AU_DELA_DE_60");
  });

  it("laisse une contrainte non confirmée hors capacité, en « À confirmer »", () => {
    const pending = item({
      themeKey: "sso",
      points: 6,
      constraint: { kind: "contrat", source: "llm", confirmed: false, rejected: false, confirmationStale: false },
    });
    const alloc = allocateMoscow([pending], STRATEGY);
    expect(classOf(alloc, "sso")).toBe("À confirmer");
    expect(alloc.mustPoints).toBe(0);
  });

  it("traite une contrainte rejetée comme un thème ordinaire", () => {
    const rejected = item({
      themeKey: "sso",
      confidence: 0.5,
      constraint: { kind: "contrat", source: "llm", confirmed: false, rejected: true, confirmationStale: false },
    });
    expect(classOf(allocateMoscow([rejected], STRATEGY), "sso")).toBe("Could");
  });

  it("écarte un non-objectif, quel que soit son RICE", () => {
    const alloc = allocateMoscow([item({ themeKey: "sombre", rice: 50, strategyFit: "non_objectif" })], STRATEGY);
    expect(classOf(alloc, "sombre")).toBe("Won't");
  });

  it("sort de l'arbitrage une issue déjà engagée", () => {
    const alloc = allocateMoscow([item({ themeKey: "notes", committedIssueId: "LIN-52" })], STRATEGY);
    expect(classOf(alloc, "notes")).toBe("Hors arbitrage");
  });

  it("scénario du lundi : Must 10, Should, puis un seul Could dans le budget de 20 %", () => {
    const alloc = allocateMoscow(
      [
        must("sso", 6),
        must("synchro", 4, "coeur_casse"),
        item({ themeKey: "partage", rice: 6, confidence: 1 }),
        item({ themeKey: "notifications", rice: 0.8, arr: 13200, confidence: 0.8 }),
        item({ themeKey: "epingle", rice: 0.8, arr: 8200, confidence: 0.8 }),
        item({ themeKey: "sombre", points: 1, rice: 0.4, confidence: 0.8, strategyFit: "non_objectif" }),
      ],
      STRATEGY,
    );
    expect(classOf(alloc, "partage")).toBe("Should");
    expect(classOf(alloc, "notifications")).toBe("Could");
    expect(classOf(alloc, "epingle")).toBe("Won't");
    expect(classOf(alloc, "sombre")).toBe("Won't");
    expect(alloc.alerts.map((a) => a.code)).toEqual(["MUST_AU_DELA_DE_60"]);
  });

  it("scénario du jeudi : la preuve élargie fait passer en Should, et la contingence disparaît", () => {
    const alloc = allocateMoscow(
      [
        must("sso", 6),
        must("synchro", 4, "coeur_casse"),
        item({ themeKey: "partage", rice: 5, confidence: 1 }),
        item({ themeKey: "notifications", rice: 1.5, arr: 35200, confidence: 1 }),
        item({ themeKey: "epingle", rice: 0.8, arr: 8200, confidence: 0.8 }),
      ],
      STRATEGY,
    );
    expect(classOf(alloc, "notifications")).toBe("Should");
    expect(classOf(alloc, "epingle")).toBe("Won't");
    expect(alloc.alerts.map((a) => a.code)).toContain("SHOULD_AU_DELA_DE_80");
  });

  it("départage à RICE égal par l'ARR, puis par la clé", () => {
    const alloc = allocateMoscow(
      [
        item({ themeKey: "b", rice: 1, arr: 100, confidence: 0.8 }),
        item({ themeKey: "a", rice: 1, arr: 900, confidence: 0.8 }),
      ],
      STRATEGY,
    );
    expect(classOf(alloc, "a")).toBe("Could");
    expect(classOf(alloc, "b")).toBe("Won't");
  });

  it("refuse un Should qui dépasserait la capacité", () => {
    const alloc = allocateMoscow([must("big", 14), item({ themeKey: "x", points: 4, rice: 3 })], STRATEGY);
    expect(classOf(alloc, "x")).toBe("Won't");
  });

  it("donne une raison à chaque décision", () => {
    const alloc = allocateMoscow([must("a", 6), item({ themeKey: "b" })], STRATEGY);
    for (const d of alloc.decisions) expect(d.reason.length).toBeGreaterThan(10);
  });
});
