import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { linearCookieKey } from "./seal";
import {
  LINEAR_SESSION_COOKIE,
  activeLinearCredentials,
  beginLinearConnect,
  disconnectLinear,
  finishLinearConnect,
  inspectLinearAccount,
  readLinearSession,
  type CookieJar,
  type LinearAccount,
} from "./connect";

const KEY = "lin_api_secret_ne_pas_afficher";
const secret = randomBytes(32).toString("base64");
const cookieKey = linearCookieKey(secret)!;

function jar(): CookieJar & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: (name) => values.get(name),
    set: (name, value) => values.set(name, value),
    delete: (name) => values.delete(name),
  };
}

const account: LinearAccount = {
  viewerName: "Camille Martin",
  workspaceId: "ws-acme",
  workspaceName: "Acme",
  teams: [
    { id: "team-1", key: "PRO", name: "Produit" },
    { id: "team-2", key: "MOB", name: "Mobile" },
  ],
};

describe("connexion Linear personnelle", () => {
  it("refuse une clé invalide sans la recopier", async () => {
    const result = await inspectLinearAccount(KEY, async () => {
      throw new Error(`unauthorized ${KEY}`);
    });
    expect(result).toEqual({ ok: false, message: "Cette clé n'est pas reconnue par Linear." });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("refuse une clé sans équipe", async () => {
    const result = await inspectLinearAccount(KEY, async () => ({ ...account, teams: [] }));
    expect(result).toEqual({ ok: false, message: "Cette clé n'a accès à aucune équipe." });
  });

  it("enregistre l'équipe choisie, sans renvoyer la clé, puis revient à la connexion par défaut", () => {
    const store = jar();
    beginLinearConnect(account, KEY, store, cookieKey);
    expect(store.values.get("etai_linear_pending")).not.toContain(KEY);
    const chosen = finishLinearConnect("team-1", store, cookieKey);
    expect(chosen).toEqual({
      ok: true,
      session: { teamId: "team-1", teamKey: "PRO", teamName: "Produit", workspaceId: "ws-acme", workspaceName: "Acme", viewerName: "Camille Martin" },
    });
    expect(JSON.stringify(chosen)).not.toContain(KEY);
    expect(store.values.get(LINEAR_SESSION_COOKIE)).not.toContain(KEY);
    const session = readLinearSession(store.values.get(LINEAR_SESSION_COOKIE), cookieKey);
    expect(session?.apiKey).toBe(KEY);
    expect(activeLinearCredentials(session, { apiKey: "lin_api_defaut", teamId: "THI" })?.source).toBe("session");
    disconnectLinear(store);
    expect(store.values.has(LINEAR_SESSION_COOKIE)).toBe(false);
    expect(activeLinearCredentials(null, { apiKey: "lin_api_defaut", teamId: "THI" })).toEqual({
      apiKey: "lin_api_defaut",
      teamId: "THI",
      source: "default",
    });
    expect(activeLinearCredentials(null, {})).toBeNull();
  });

  it("refuse une équipe qui n'était pas dans la liste", () => {
    const store = jar();
    beginLinearConnect(account, KEY, store, cookieKey);
    const refused = finishLinearConnect("team-inconnue", store, cookieKey);
    expect(refused).toEqual({ ok: false, message: "Cette équipe n'est pas accessible avec cette clé." });
    expect(JSON.stringify(refused)).not.toContain(KEY);
  });
});
