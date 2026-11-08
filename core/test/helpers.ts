import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Strategy } from "../schemas";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const STRATEGY: Strategy = {
  company: "Test",
  product: "Test",
  currentRelease: { version: "1.0.0", releasedOn: "2026-10-01" },
  okrs: [{ id: "OKR1", title: "t", keyResult: "k" }],
  nonGoals: [],
  capacity: {
    cycle: { start: "2026-11-09", end: "2026-11-20" },
    grossPoints: 20,
    committedIssueIds: ["LIN-12", "LIN-52"],
    committedPoints: 4,
    mustAlertRatio: 0.6,
    shouldLineRatio: 0.8,
    couldBudgetRatio: 0.2,
  },
  sizePoints: { XS: 1, S: 2, M: 4, L: 6, XL: 10 },
  referenceStories: [{ id: "REF-1", title: "réf", size: "S" }],
};
