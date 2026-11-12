import { describe, expect, it } from "vitest";
import { SIGN_IN_REQUIRED, authorizeLinearExport, authorizeSpend, safeNextPath } from "./gate";

const ada = { id: "user-ada", email: "ADA@acme.example" };

describe("session", () => {
  it("refuse sans session, avec un 401", () => {
    expect(authorizeSpend(null)).toEqual({ ok: false, status: 401, message: SIGN_IN_REQUIRED });
    expect(authorizeSpend({ id: "  ", email: "ada@acme.example" })).toEqual({ ok: false, status: 401, message: SIGN_IN_REQUIRED });
  });

  it("accepte n'importe quelle adresse dès qu'une session existe", () => {
    expect(authorizeSpend(ada)).toEqual({ ok: true, id: "user-ada", email: "ada@acme.example" });
    expect(authorizeSpend({ id: "user-beau", email: "beau@example.com" }).ok).toBe(true);
  });

  it("autorise l'export avec une clé personnelle sans session, et refuse la clé partagée", () => {
    expect(authorizeLinearExport(null, "session")).toEqual({ ok: true, id: "", email: "" });
    expect(authorizeLinearExport(null, "default")).toEqual({ ok: false, status: 401, message: SIGN_IN_REQUIRED });
    expect(authorizeLinearExport(ada, "default").ok).toBe(true);
  });
});

describe("retour après l'accès", () => {
  it("n'accepte qu'un chemin relatif", () => {
    expect(safeNextPath("https://example.com")).toBe("/lundi");
    expect(safeNextPath("/jeudi/themes/partage_client")).toBe("/jeudi/themes/partage_client");
  });
});
