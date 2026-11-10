import { describe, expect, it } from "vitest";
import { authCallbackLocation, getPublicOrigin, safeRelativePath } from "./origin";

const publicUrl = "https://thiga-po-agent.onrender.com";

describe("origine publique", () => {
  it("prend ETAI_PUBLIC_URL avant les en-têtes et l'hôte interne", () => {
    expect(
      getPublicOrigin({
        configuredUrl: `${publicUrl}/`,
        forwardedHost: "autre.example",
        forwardedProto: "https",
        requestOrigin: "https://0.0.0.0:10000",
        nodeEnv: "production",
      }),
    ).toBe(publicUrl);
  });

  it("prend les en-têtes transmis quand l'URL n'est pas définie", () => {
    expect(
      getPublicOrigin({
        forwardedHost: "thiga-po-agent.onrender.com",
        forwardedProto: "https",
        requestOrigin: "http://0.0.0.0:10000",
        nodeEnv: "production",
      }),
    ).toBe(publicUrl);
  });

  it("n'utilise l'origine de la requête qu'en développement", () => {
    expect(
      getPublicOrigin({
        requestOrigin: "http://0.0.0.0:10000",
        nodeEnv: "production",
      }),
    ).toBeNull();
    expect(
      getPublicOrigin({
        requestOrigin: "http://localhost:43217",
        nodeEnv: "development",
      }),
    ).toBe("http://localhost:43217");
  });

  it("ignore un hôte transmis qui est 0.0.0.0", () => {
    expect(
      getPublicOrigin({
        forwardedHost: "0.0.0.0:10000",
        forwardedProto: "https",
        requestOrigin: "https://0.0.0.0:10000",
        nodeEnv: "production",
      }),
    ).toBeNull();
  });
});

describe("callback du lien magique", () => {
  it("revient sur la page d'origine, avec etape=cle, jamais sur 0.0.0.0", () => {
    const next = "/lundi/themes/partage_client?etape=cle";
    expect(authCallbackLocation({ origin: publicUrl, next, ok: true })).toBe(`${publicUrl}${next}`);
    expect(authCallbackLocation({ origin: publicUrl, next, ok: true })).not.toContain("0.0.0.0");
  });

  it("en cas d'échec, /connexion reste sur l'origine publique et garde next", () => {
    const next = "/lundi?etape=cle";
    const location = authCallbackLocation({ origin: publicUrl, next, ok: false });
    expect(location.startsWith(`${publicUrl}/connexion?next=`)).toBe(true);
    expect(decodeURIComponent(location)).toContain(next);
    expect(location).not.toContain("0.0.0.0");
  });

  it("refuse une redirection ouverte", () => {
    expect(safeRelativePath("https://evil.example")).toBe("/lundi");
    expect(safeRelativePath("//evil.example")).toBe("/lundi");
    expect(safeRelativePath("/\\evil.example")).toBe("/lundi");
    expect(authCallbackLocation({ origin: publicUrl, next: "https://evil.example", ok: true })).toBe(`${publicUrl}/lundi`);
    expect(safeRelativePath("/lundi/themes/partage_client?etape=cle")).toBe("/lundi/themes/partage_client?etape=cle");
  });
});
