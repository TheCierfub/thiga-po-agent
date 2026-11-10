import { describe, expect, it } from "vitest";
import {
  EMAIL_NOT_ALLOWED,
  MAGIC_LINK_NOTICE,
  SIGN_IN_REQUIRED,
  authorizeLinearExport,
  authorizeSpend,
  magicLinkDecision,
  parseAllowedEmails,
  safeNextPath,
} from "./gate";

const allowed = parseAllowedEmails(" Camille@Acme.example , autre@acme.example, camille@acme.example ");

describe("liste d'emails", () => {
  it("normalise la casse, les espaces et les doublons", () => {
    expect(allowed).toEqual(["camille@acme.example", "autre@acme.example"]);
    expect(parseAllowedEmails("  ,  ")).toEqual([]);
    expect(parseAllowedEmails(undefined)).toEqual([]);
  });
});

describe("actions protégées", () => {
  it("refuse sans session, avec un 401", () => {
    expect(authorizeSpend(null, allowed)).toEqual({ ok: false, status: 401, message: SIGN_IN_REQUIRED });
    const blank = authorizeSpend({ email: "   " }, allowed);
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.status).toBe(401);
  });

  it("refuse un email hors liste", () => {
    const refused = authorizeSpend({ email: "visiteur@example.com" }, allowed);
    expect(refused).toEqual({ ok: false, status: 403, message: EMAIL_NOT_ALLOWED });
    expect(JSON.stringify(refused)).not.toContain("camille@acme.example");
  });

  it("accepte une adresse de la liste, quelle que soit la casse", () => {
    expect(authorizeSpend({ email: "CAMILLE@acme.example" }, allowed)).toEqual({ ok: true, email: "camille@acme.example" });
  });

  it("autorise l'export avec une clé personnelle sans session, et refuse la clé partagée", () => {
    expect(authorizeLinearExport(null, allowed, "session")).toEqual({ ok: true, email: "" });
    expect(authorizeLinearExport(null, allowed, "default")).toEqual({ ok: false, status: 401, message: SIGN_IN_REQUIRED });
    const outsider = authorizeLinearExport({ email: "visiteur@example.com" }, allowed, "default");
    expect(outsider.ok).toBe(false);
    if (!outsider.ok) expect(outsider.status).toBe(403);
    expect(authorizeLinearExport({ email: "camille@acme.example" }, allowed, "default").ok).toBe(true);
  });
});

describe("lien de connexion", () => {
  it("renvoie le même texte, et n'envoie rien hors liste", () => {
    const allowedSend = magicLinkDecision("camille@acme.example", allowed);
    const refused = magicLinkDecision("visiteur@example.com", allowed);
    const empty = magicLinkDecision("   ", allowed);
    expect(allowedSend).toEqual({ send: true, notice: MAGIC_LINK_NOTICE });
    expect(refused).toEqual({ send: false, notice: MAGIC_LINK_NOTICE });
    expect(empty.notice).toBe(refused.notice);
    expect(empty.send).toBe(false);
    expect(safeNextPath("https://example.com")).toBe("/lundi");
    expect(safeNextPath("//example.com")).toBe("/lundi");
    expect(safeNextPath("/jeudi/themes/partage_client")).toBe("/jeudi/themes/partage_client");
  });
});
