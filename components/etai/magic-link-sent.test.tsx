import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MagicLinkSent } from "./magic-link-sent";

describe("confirmation du lien", () => {
  it("nomme l'adresse et le délai avant de renvoyer", () => {
    const html = renderToStaticMarkup(
      createElement(MagicLinkSent, { email: "ada@acme.example", resendIn: 60, canResend: false }),
    );
    expect(html).toContain("Lien envoyé à ada@acme.example");
    expect(html).toContain("Ouvrez-le dans ce navigateur pour continuer.");
    expect(html).toContain("Changer d&#x27;adresse");
    expect(html).toContain("Renvoyer (60 s)");
    expect(html).not.toContain("Recevoir un lien de connexion");
  });
});
