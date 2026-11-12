import { describe, expect, it } from "vitest";
import {
  ACCESS_CLOSED,
  ACCESS_DENIED,
  ACCESS_LIMIT,
  ACCESS_WINDOW_MS,
  accessConfigured,
  allowAccessAttempt,
  checkAccessCode,
  signAccessCookie,
  verifyAccessCookie,
} from "./access-code";

const secret = "secret-de-test-assez-long";
const code = "code-de-test";

describe("code d'accès", () => {
  it("accepte le bon code, refuse le mauvais, et reste fermé sans variable", () => {
    expect(checkAccessCode(code, code)).toBe("ok");
    expect(checkAccessCode("autre", code)).toBe("bad");
    expect(checkAccessCode(code, undefined)).toBe("closed");
    expect(checkAccessCode(code, "  ")).toBe("closed");
    expect(accessConfigured(undefined, secret)).toBe(false);
    expect(accessConfigured(code, undefined)).toBe(false);
    expect(ACCESS_CLOSED).not.toContain(code);
    expect(ACCESS_DENIED).not.toContain(code);
  });

  it("signe le cookie et refuse une signature ou une date fausse", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = signAccessCookie(secret, exp);
    expect(token).not.toContain(secret);
    expect(verifyAccessCookie(token, secret)).toBe(true);
    expect(verifyAccessCookie(token, "autre-secret")).toBe(false);
    expect(verifyAccessCookie(`${token}x`, secret)).toBe(false);
    expect(verifyAccessCookie(token, secret, (exp + 1) * 1000)).toBe(false);
    expect(verifyAccessCookie(undefined, secret)).toBe(false);
  });

  it("limite les tentatives par adresse IP", () => {
    let history: { ip: string; at: number }[] = [];
    for (let i = 0; i < 10; i += 1) {
      const next = allowAccessAttempt({ ip: "1.1.1.1", now: i, history });
      expect(next.ok).toBe(true);
      history = next.history;
    }
    const blocked = allowAccessAttempt({ ip: "1.1.1.1", now: 11, history });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toBe(ACCESS_LIMIT);
    expect(allowAccessAttempt({ ip: "8.8.8.8", now: 12, history }).ok).toBe(true);
    expect(allowAccessAttempt({ ip: "1.1.1.1", now: ACCESS_WINDOW_MS + 20, history }).ok).toBe(true);
  });
});
