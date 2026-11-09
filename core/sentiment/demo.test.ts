import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../test/helpers";
import { applyDemoSentiments, loadDemoSentiments } from "./demo";

describe("sentiments de démo", () => {
  it("couvre les 52 feedbacks du corpus, et ne remplace pas une décision déjà posée", () => {
    const values = loadDemoSentiments(ROOT);
    const ids = ["lundi", "jeudi"].flatMap((batch) => {
      const file = JSON.parse(readFileSync(path.join(ROOT, "data/feedbacks", `batch-${batch}.json`), "utf8")) as { feedbacks: { id: string }[] };
      return file.feedbacks.map((item) => item.id);
    });
    expect(ids).toHaveLength(52);
    expect(Object.keys(values).sort()).toEqual([...ids].sort());
    expect(values["fb-lundi-13"]).toBe("positif");
    expect(values["fb-lundi-36"]).toBe("indetermine");
    const state = {
      classifications: [
        { feedbackId: "fb-lundi-13", sentiment: "neutre" as const },
        { feedbackId: "fb-lundi-01" },
      ],
    };
    const applied = applyDemoSentiments(state as never, values);
    expect(applied.classifications[0]?.sentiment).toBe("neutre");
    expect(applied.classifications[1]?.sentiment).toBe("neutre");
  });
});