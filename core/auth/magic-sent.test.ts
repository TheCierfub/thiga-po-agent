import { describe, expect, it } from "vitest";
import { MAGIC_RESEND_MS, magicLinkPanel } from "./magic-sent";

describe("confirmation du lien magique", () => {
  it("affiche l'adresse envoyée et bloque le renvoi pendant 60 s", () => {
    const sentAt = 1_000;
    const fresh = magicLinkPanel({ email: "ada@acme.example", sentAt }, sentAt + 1_000);
    expect(fresh).toEqual({ mode: "sent", email: "ada@acme.example", resendIn: 59, canResend: false });
    const later = magicLinkPanel({ email: "ada@acme.example", sentAt }, sentAt + MAGIC_RESEND_MS);
    expect(later).toEqual({ mode: "sent", email: "ada@acme.example", resendIn: 0, canResend: true });
  });

  it("revient au formulaire si aucune adresse n'est gardée", () => {
    expect(magicLinkPanel(null, 0)).toEqual({ mode: "form" });
    expect(magicLinkPanel({ email: "  ", sentAt: 1 }, 2)).toEqual({ mode: "form" });
  });
});
