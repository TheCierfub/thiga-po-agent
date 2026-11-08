import { describe, expect, it } from "vitest";
import type { Account, AuthorMatch, Feedback } from "../schemas";
import { STRATEGY } from "../test/helpers";
import { computeConfidence, computeReach, computeRice } from "./rice";
import { windowEndingOn } from "./window";

const feedback = (id: string, date: string, channel: Feedback["channel"] = "email"): Feedback => ({
  id,
  batch: "t",
  channel,
  receivedAt: `${date}T10:00:00+01:00`,
  author: { name: null, email: null, handle: null, anonymous: false },
  sourceAccountId: null,
  language: "fr",
  text: "texte",
});

const match = (id: string, accountId: string | null, confidence: AuthorMatch["confidence"] = "certaine"): AuthorMatch => ({
  feedbackId: id,
  accountId,
  candidateAccountId: null,
  confidence,
  method: accountId ? "email" : "aucune",
  explanation: "",
  sourceDisagreement: false,
});

const account = (id: string, arr: number): Account => ({
  id,
  identifiant_interne: id,
  nom: id,
  offre: "Pro",
  arr,
  statut: "client",
  risque_churn: "faible",
  contacts: [],
  notes: "",
});

const fixture = () => {
  const fbs = [
    feedback("a1", "2026-10-20"),
    feedback("a2", "2026-10-21", "ticket_support"),
    feedback("b1", "2026-10-22", "forum_produit"),
    feedback("anon", "2026-10-23"),
    feedback("old", "2026-09-01"),
  ];
  return {
    feedbackIds: fbs.map((f) => f.id),
    feedbacks: new Map(fbs.map((f) => [f.id, f])),
    matches: new Map([
      ["a1", match("a1", "acc-a")],
      ["a2", match("a2", "acc-a")],
      ["b1", match("b1", "acc-b")],
      ["anon", match("anon", null, "anonyme")],
      ["old", match("old", "acc-c")],
    ]),
    accounts: new Map([
      ["acc-a", account("acc-a", 6000)],
      ["acc-b", account("acc-b", 22000)],
      ["acc-c", account("acc-c", 50000)],
    ]),
    window: windowEndingOn("2026-11-02"),
  };
};

describe("Reach", () => {
  it("compte les comptes distincts certains, dans la fenêtre", () => {
    const reach = computeReach({ ...fixture(), mode: "comptes" });
    expect(reach.value).toBe(2);
    expect(reach.accounts).toEqual(["acc-a", "acc-b"]);
    expect(reach.messages).toBe(4);
    expect(reach.excluded.map((e) => e.feedbackId)).toEqual(["anon", "old"]);
  });

  it("bascule en volume de messages", () => {
    expect(computeReach({ ...fixture(), mode: "volume" }).value).toBe(4);
  });

  it("bascule en ARR, en milliers d'euros, sans doublon de compte", () => {
    const reach = computeReach({ ...fixture(), mode: "arr" });
    expect(reach.arr).toBe(28000);
    expect(reach.value).toBe(28);
  });

  it("n'ajoute pas un compte probable ou faible", () => {
    const f = fixture();
    f.matches.set("b1", { ...match("b1", null, "probable"), candidateAccountId: "acc-b" });
    expect(computeReach({ ...f, mode: "comptes" }).accounts).toEqual(["acc-a"]);
  });
});

describe("Confidence", () => {
  it("100 % à partir de 3 comptes sur 2 canaux", () => {
    expect(computeConfidence(3, ["email", "x"]).value).toBe(1);
  });
  it("80 % avec 3 comptes sur un seul canal", () => {
    expect(computeConfidence(3, ["email", "email"]).value).toBe(0.8);
  });
  it("80 % avec 2 comptes", () => {
    expect(computeConfidence(2, ["email", "x", "reddit"]).value).toBe(0.8);
  });
  it("50 % avec un seul compte, même sur plusieurs canaux", () => {
    expect(computeConfidence(1, ["email", "x"]).value).toBe(0.5);
    expect(computeConfidence(0, []).value).toBe(0.5);
  });
});

describe("RICE", () => {
  it("Reach × Impact × Confidence ÷ points", () => {
    const reach = computeReach({ ...fixture(), mode: "comptes" });
    const rice = computeRice({
      themeKey: "t",
      reach,
      confidence: computeConfidence(2, reach.channels),
      impact: { value: 2, source: "llm" },
      effort: { size: "S", source: "llm" },
      strategy: STRATEGY,
    });
    expect(rice.effort.points).toBe(2);
    expect(rice.score).toBe(1.6);
  });

  it("utilise la table de tailles de la stratégie", () => {
    const reach = { ...computeReach({ ...fixture(), mode: "comptes" }), value: 6 };
    const rice = computeRice({
      themeKey: "t",
      reach,
      confidence: computeConfidence(6, ["email", "x"]),
      impact: { value: 2, source: "po" },
      effort: { size: "L", source: "po" },
      strategy: STRATEGY,
    });
    expect(rice.score).toBe(2);
  });
});
