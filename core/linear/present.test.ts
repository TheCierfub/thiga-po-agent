import { describe, expect, it } from "vitest";
import { CONNECT_LINEAR, presentLinear } from "./present";

const produit = { name: "Produit", key: "PRO", workspaceName: "Acme" };

describe("badge Linear", () => {
  it("reste neutre sans clé personnelle, même si le serveur a une équipe", () => {
    const view = presentLinear({ personalKey: false, team: produit });
    expect(view).toMatchObject({ label: CONNECT_LINEAR, tone: "neutre", phase: "cle" });
    expect(view.label).not.toContain("Produit");
  });

  it("passe au vert seulement avec une clé personnelle", () => {
    const view = presentLinear({ personalKey: true, team: produit });
    expect(view).toMatchObject({ label: "Linear connecté · Produit", tone: "vert", phase: "gestion" });
    expect(view.label).not.toMatch(/jury/i);
  });
});
