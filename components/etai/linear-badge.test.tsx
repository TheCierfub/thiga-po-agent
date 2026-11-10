import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { presentLinear } from "../../core/linear/present";
import { LinearHeaderBadge } from "./linear-badge";

const produit = { name: "Produit", key: "PRO", workspaceName: "Acme" };

function html(input: Parameters<typeof presentLinear>[0]) {
  return renderToStaticMarkup(createElement(LinearHeaderBadge, { view: presentLinear(input) }));
}

describe("rendu du badge Linear", () => {
  it("rend les trois états, sans point vert tant qu'il n'y a pas de clé personnelle", () => {
    const anonymous = html({ hasSession: false, personalKey: false, team: produit, requestedStep: null });
    const signedIn = html({ hasSession: true, personalKey: false, team: produit, requestedStep: null });
    const personal = html({ hasSession: true, personalKey: true, team: produit, requestedStep: null });
    expect(anonymous).toContain("Connecter Linear");
    expect(signedIn).toContain("Connecter Linear");
    expect(anonymous).not.toContain("linear-dot");
    expect(signedIn).not.toContain("linear-dot");
    expect(anonymous).not.toContain("Produit");
    expect(personal).toContain("Linear connecté · Produit");
    expect(personal).toContain("linear-dot");
    expect(personal).toContain("bg-ok-bg");
    expect(`${anonymous} ${signedIn} ${personal}`).not.toMatch(/jury/i);
  });
});
