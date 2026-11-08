import { describe, expect, it } from "vitest";
import { computeTrend } from "./trend";
import { weekIndex, windowEndingOn } from "./window";

const at = (date: string) => `${date}T09:00:00+01:00`;

describe("fenêtre de 4 semaines", () => {
  it("compte 28 jours, fin incluse", () => {
    expect(windowEndingOn("2026-11-02")).toEqual({ start: "2026-10-06", end: "2026-11-02" });
  });
  it("range les dates par semaine, la plus récente en dernier", () => {
    const w = windowEndingOn("2026-11-02");
    expect(weekIndex(at("2026-10-06"), w)).toBe(0);
    expect(weekIndex(at("2026-10-27"), w)).toBe(3);
    expect(weekIndex(at("2026-11-02"), w)).toBe(3);
    expect(weekIndex(at("2026-10-05"), w)).toBe(-1);
  });
});

describe("tendance contre récurrent", () => {
  const w = windowEndingOn("2026-11-02");

  it("détecte une accélération brutale sur la dernière semaine", () => {
    const dates = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"].map(at);
    const trend = computeTrend(dates, w);
    expect(trend.kind).toBe("tendance");
    expect(trend.weeklyCounts).toEqual([0, 0, 0, 5]);
  });

  it("classe un stock régulier en récurrent", () => {
    const dates = ["2026-10-07", "2026-10-15", "2026-10-21", "2026-10-28"].map(at);
    expect(computeTrend(dates, w).kind).toBe("recurrent");
  });

  it("ne confond pas trois messages récents avec une tendance", () => {
    const dates = ["2026-10-13", "2026-10-21", "2026-10-28", "2026-10-29", "2026-10-30"].map(at);
    expect(computeTrend(dates, w).kind).toBe("recurrent");
  });

  it("refuse une tendance si la dernière semaine n'est pas au double", () => {
    const dates = [
      ...["2026-10-07", "2026-10-08", "2026-10-09"],
      ...["2026-10-14", "2026-10-15", "2026-10-16"],
      ...["2026-10-21", "2026-10-22", "2026-10-23"],
      ...["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"],
    ].map(at);
    expect(computeTrend(dates, w).kind).toBe("recurrent");
  });

  it("laisse un signal isolé en ponctuel", () => {
    expect(computeTrend([at("2026-10-14"), at("2026-10-28")], w).kind).toBe("ponctuel");
  });
});
