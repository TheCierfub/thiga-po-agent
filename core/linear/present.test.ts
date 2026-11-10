import { describe, expect, it } from "vitest";
import { CONNECT_LINEAR, presentLinear, withKeyStep } from "./present";

const produit = { name: "Produit", key: "PRO", workspaceName: "Acme" };
const mobile = { name: "Mobile", key: "MOB", workspaceName: "Acme" };

describe("badge Linear selon le visiteur", () => {
  it("reste neutre sans clé, session ou non, et ne reprend pas l'équipe du serveur", () => {
    const anonymous = presentLinear({ hasSession: false, personalKey: false, team: produit, requestedStep: null });
    const signedIn = presentLinear({ hasSession: true, personalKey: false, team: produit, requestedStep: null });
    expect(anonymous).toMatchObject({ label: CONNECT_LINEAR, tone: "neutre", phase: "compte", stepLabel: "1/2", reopen: false });
    expect(signedIn).toMatchObject({ label: CONNECT_LINEAR, tone: "neutre", phase: "cle", stepLabel: "2/2", reopen: false });
    expect(anonymous.label).not.toContain("Produit");
    expect(signedIn.label).not.toContain("Produit");
  });

  it("passe au vert seulement avec une clé personnelle, et le libellé suit l'équipe", () => {
    const first = presentLinear({ hasSession: true, personalKey: true, team: produit, requestedStep: null });
    const second = presentLinear({ hasSession: false, personalKey: true, team: mobile, requestedStep: null });
    expect(first).toMatchObject({ label: "Linear connecté · Produit", tone: "vert", phase: "gestion", hint: "Espace Acme, équipe Produit (PRO)" });
    expect(second.label).toBe("Linear connecté · Mobile");
    expect(first.label).not.toBe(second.label);
    expect(`${first.label} ${second.label}`).not.toMatch(/jury/i);
  });
});

describe("modale en deux étapes", () => {
  it("enchaîne le compte, puis la clé, puis la gestion", () => {
    const start = presentLinear({ hasSession: false, personalKey: false, team: null, requestedStep: null });
    expect(start.phase).toBe("compte");
    const afterLink = presentLinear({ hasSession: true, personalKey: false, team: null, requestedStep: null });
    expect(afterLink.phase).toBe("cle");
    const done = presentLinear({ hasSession: true, personalKey: true, team: produit, requestedStep: null });
    expect(done.phase).toBe("gestion");
  });

  it("rouvre l'étape de la clé au retour du lien", () => {
    const back = presentLinear({ hasSession: true, personalKey: false, team: null, requestedStep: "cle" });
    expect(back.reopen).toBe(true);
    expect(back.phase).toBe("cle");
    expect(back.stepLabel).toBe("2/2");
    const withoutSession = presentLinear({ hasSession: false, personalKey: false, team: null, requestedStep: "cle" });
    expect(withoutSession.reopen).toBe(false);
    expect(withoutSession.phase).toBe("compte");
    expect(withKeyStep("/lundi/themes/partage_client")).toBe("/lundi/themes/partage_client?etape=cle");
    expect(withKeyStep("https://example.com")).toBe("/lundi?etape=cle");
  });
});
