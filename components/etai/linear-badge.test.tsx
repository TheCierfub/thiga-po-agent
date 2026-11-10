import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { linearBadgeHint } from "../../core/linear/badge";
import { LinearHeaderBadge } from "./linear-badge";

const produit = { name: "Produit", key: "PRO", workspaceName: "Acme" };
const mobile = { name: "Mobile", key: "MOB", workspaceName: "Acme" };

describe("badge Linear", () => {
  it("rend le badge selon l'équipe renvoyée, et sans nom s'il manque", () => {
    const produitHtml = renderToStaticMarkup(createElement(LinearHeaderBadge, { team: produit }));
    const mobileHtml = renderToStaticMarkup(createElement(LinearHeaderBadge, { team: mobile }));
    expect(produitHtml).toContain("Linear connecté · Produit");
    expect(mobileHtml).toContain("Linear connecté · Mobile");
    expect(produitHtml).not.toBe(mobileHtml);
    expect(produitHtml).not.toContain("Acme");
    expect(linearBadgeHint(produit)).toBe("Espace Acme, équipe Produit (PRO)");
    expect(linearBadgeHint(mobile)).toBe("Espace Acme, équipe Mobile (MOB)");
    const unnamed = renderToStaticMarkup(createElement(LinearHeaderBadge, { team: { name: "  ", key: "PRO", workspaceName: "Acme" } }));
    expect(unnamed).toBe("<span class=\"truncate\">Linear connecté</span>");
    expect(unnamed).not.toContain("PRO");
    expect(`${produitHtml} ${mobileHtml} ${unnamed}`).not.toMatch(/jury/i);
  });
});
