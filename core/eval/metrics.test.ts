import { describe, expect, it } from "vitest";
import { jaccard, matchThemes, moscowFromLabel, setScores } from "./metrics";

describe("métriques d'évaluation", () => {
  it("Jaccard", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
  });

  it("apparie chaque thème attendu au plus à un thème trouvé", () => {
    const { matches, unmatchedFound } = matchThemes(
      { partage: ["1", "2", "3"], sombre: ["4", "5"] },
      { x: ["1", "2"], y: ["1"], z: ["9"] },
    );
    expect(matches).toEqual([
      { expected: "partage", found: "x", score: 2 / 3 },
      { expected: "sombre", found: null, score: 0 },
    ]);
    expect(unmatchedFound).toEqual(["y", "z"]);
  });

  it("précision et rappel d'un ensemble", () => {
    const s = setScores(["a", "b"], ["b", "c"]);
    expect(s.precision).toEqual({ ok: 1, total: 2 });
    expect(s.recall).toEqual({ ok: 1, total: 2 });
    expect(s.falseNegatives).toEqual(["c"]);
  });

  it("lit la classe dans les libellés de la clé", () => {
    expect(moscowFromLabel("Must, à confirmer par le PO")).toBe("Must");
    expect(moscowFromLabel("Won't ce cycle (capacité)")).toBe("Won't");
    expect(moscowFromLabel("hors arbitrage (déjà engagé)")).toBe("Hors arbitrage");
    expect(moscowFromLabel("inchangé")).toBeNull();
  });
});
