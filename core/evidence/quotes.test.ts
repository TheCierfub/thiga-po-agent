import { describe, expect, it } from "vitest";
import { checkQuotes, isExactQuote } from "./quotes";

const texts = new Map([
  ["fb-1", "Le client appelle deux fois par semaine pour savoir où on en est."],
  ["fb-2", "Vous pouvez me joindre au [TÉLÉPHONE]."],
]);

describe("citations", () => {
  it("accepte une sous-chaîne exacte, espaces de bord retirés", () => {
    expect(isExactQuote("  appelle deux fois par semaine ", texts.get("fb-1")!)).toBe(true);
  });

  it("rejette une paraphrase, même proche", () => {
    expect(isExactQuote("le client appelle 2 fois par semaine", texts.get("fb-1")!)).toBe(false);
  });

  it("rejette un changement de casse ou d'accent", () => {
    expect(isExactQuote("Où on en est", texts.get("fb-1")!)).toBe(false);
  });

  it("rejette une citation attribuée au mauvais feedback", () => {
    const check = checkQuotes([{ feedbackId: "fb-2", text: "appelle deux fois" }], texts);
    expect(check.accepted).toEqual([]);
    expect(check.rejected).toHaveLength(1);
  });

  it("rejette une citation d'un feedback hors périmètre", () => {
    expect(checkQuotes([{ feedbackId: "fb-9", text: "appelle" }], texts).rejected).toHaveLength(1);
  });

  it("vérifie contre le texte masqué : une donnée personnelle d'origine ne passe pas", () => {
    expect(isExactQuote("06 12 34 56 78", texts.get("fb-2")!)).toBe(false);
    expect(isExactQuote("joindre au [TÉLÉPHONE]", texts.get("fb-2")!)).toBe(true);
  });
});
