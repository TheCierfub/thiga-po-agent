import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { linearCookieKey, openJson, sealJson } from "./seal";

const secret = randomBytes(32).toString("base64");
const key = linearCookieKey(secret)!;

describe("cookie Linear", () => {
  it("chiffre puis déchiffre, et le jeton ne contient pas la clé", () => {
    const apiKey = "lin_api_secret_ne_pas_afficher";
    const token = sealJson({ apiKey, teamId: "team-1" }, key);
    expect(token).not.toContain(apiKey);
    expect(openJson<{ apiKey: string }>(token, key)?.apiKey).toBe(apiKey);
  });

  it("refuse un secret qui n'est pas 32 octets en base64, et un jeton altéré", () => {
    expect(linearCookieKey("trop-court")).toBeNull();
    expect(linearCookieKey(Buffer.from("abcd").toString("base64"))).toBeNull();
    const token = sealJson({ apiKey: "lin_api_x" }, key);
    const flipped = `${token.slice(0, -2)}aa`;
    expect(openJson(flipped, key)).toBeNull();
    expect(openJson(token, randomBytes(32))).toBeNull();
  });
});
