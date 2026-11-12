import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { presentLinear } from "../../core/linear/present";
import { LinearHeaderBadge } from "./linear-badge";

const produit = { name: "Produit", key: "PRO", workspaceName: "Acme" };

function html(personalKey: boolean) {
  return renderToStaticMarkup(createElement(LinearHeaderBadge, { view: presentLinear({ personalKey, team: produit }) }));
}

describe("rendu du badge Linear", () => {
  it("reste neutre sans clé personnelle et vert avec", () => {
    const locked = html(false);
    const personal = html(true);
    expect(locked).toContain("Connecter Linear");
    expect(locked).not.toContain("linear-dot");
    expect(locked).not.toContain("Produit");
    expect(personal).toContain("Linear connecté · Produit");
    expect(personal).toContain("linear-dot");
    expect(`${locked} ${personal}`).not.toMatch(/jury/i);
  });
});
