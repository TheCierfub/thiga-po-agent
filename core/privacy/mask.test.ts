import { describe, expect, it } from "vitest";
import { maskText } from "./mask";

describe("masquage des données personnelles", () => {
  it("masque un téléphone français, avec ou sans séparateurs", () => {
    expect(maskText("Appelez le 06 12 34 56 78 ou le 0612345678.").text).toBe(
      "Appelez le [TÉLÉPHONE] ou le [TÉLÉPHONE].",
    );
    expect(maskText("Tél. +33 6 12 34 56 78").text).toBe("Tél. [TÉLÉPHONE]");
  });

  it("masque une adresse avec code postal et ville", () => {
    const { text, pii } = maskText("chantier résidence Les Glycines, 14 impasse du Chantier-Neuf, 69007 Lyon. J'en ai saisi six");
    expect(text).toBe("chantier résidence Les Glycines, [ADRESSE]. J'en ai saisi six");
    expect(pii).toEqual([{ kind: "adresse", count: 1 }]);
  });

  it("masque les e-mails, y compris dans une signature", () => {
    expect(maskText("Jean\njean.maree@maree-fils.example").text).toBe("Jean\n[EMAIL]");
  });

  it("ne touche pas aux nombres métier ni aux noms de société", () => {
    const text = "Chantier de la rue des Lilas (12 logements), lot R+2, Quai 17, 14 opérations, version 2.4.0.";
    expect(maskText(text)).toEqual({ text, pii: [] });
  });
});
