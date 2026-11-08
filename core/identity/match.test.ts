import { describe, expect, it } from "vitest";
import type { Account, Feedback } from "../schemas";
import { buildIdentityIndex, matchAuthor } from "./match";

const accounts: Account[] = [
  {
    id: "acc-maree",
    identifiant_interne: "cus_1",
    nom: "Marée & Fils",
    offre: "Pro",
    arr: 5400,
    statut: "client",
    risque_churn: "faible",
    contacts: [
      {
        nom: "Jean Marée",
        email: "jean.maree@maree-fils.example",
        role: "Dirigeant",
        pseudos: [{ reseau: "x", pseudo: "@jeanmaree_bat" }],
      },
    ],
    notes: "",
  },
];
const index = buildIdentityIndex(accounts);

const fb = (author: Partial<Feedback["author"]>, sourceAccountId: string | null = null): Feedback => ({
  id: "fb",
  batch: "t",
  channel: "email",
  receivedAt: "2026-10-20T10:00:00+01:00",
  author: { name: null, email: null, handle: null, anonymous: false, ...author },
  sourceAccountId,
  language: "fr",
  text: "x",
});

describe("rapprochement auteur-compte", () => {
  it("e-mail connu : certain, insensible à la casse", () => {
    const m = matchAuthor(fb({ email: "Jean.Maree@maree-fils.example" }), index);
    expect(m).toMatchObject({ accountId: "acc-maree", confidence: "certaine", method: "email" });
  });

  it("pseudo connu : certain", () => {
    expect(matchAuthor(fb({ handle: "@JeanMaree_bat" }), index)).toMatchObject({
      accountId: "acc-maree",
      confidence: "certaine",
      method: "pseudo",
    });
  });

  it("pseudo inconnu : confiance faible, aucun compte deviné", () => {
    expect(matchAuthor(fb({ handle: "u/betonniere92" }), index)).toMatchObject({
      accountId: null,
      candidateAccountId: null,
      confidence: "faible",
    });
  });

  it("même domaine, adresse inconnue : probable, candidat affiché mais pas de compte", () => {
    expect(matchAuthor(fb({ email: "chantier@maree-fils.example" }), index)).toMatchObject({
      accountId: null,
      candidateAccountId: "acc-maree",
      confidence: "probable",
    });
  });

  it("adresse inconnue : non rapproché, aucun compte créé", () => {
    expect(matchAuthor(fb({ email: "liam@pipelinenorth.example" }), index)).toMatchObject({
      accountId: null,
      confidence: "non_rapproche",
    });
  });

  it("anonyme", () => {
    expect(matchAuthor(fb({ anonymous: true }), index).confidence).toBe("anonyme");
  });

  it("signale un désaccord avec le compte déclaré par la source", () => {
    expect(matchAuthor(fb({ handle: "u/inconnu" }, "acc-maree"), index).sourceDisagreement).toBe(true);
    expect(matchAuthor(fb({ handle: "@jeanmaree_bat" }, "acc-maree"), index).sourceDisagreement).toBe(false);
  });
});
