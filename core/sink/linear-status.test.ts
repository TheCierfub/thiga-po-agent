import { describe, expect, it } from "vitest";
import { memoryLinearStatusCache, resolveLinearStatus, type LinearTeamLabel } from "./linear-status";

const KEY = "lin_api_secret_ne_pas_afficher";

describe("statut Linear", () => {
  it("est connecté quand l'équipe répond, et ne rappelle pas Linear dans la minute", async () => {
    const cache = memoryLinearStatusCache();
    let calls = 0;
    const probe = async (): Promise<LinearTeamLabel> => {
      calls += 1;
      return { key: "THI", name: "Thiga_case_study" };
    };
    const first = await resolveLinearStatus({ apiKey: KEY, teamId: "THI", now: 1_000, cache, probe });
    const second = await resolveLinearStatus({ apiKey: KEY, teamId: "THI", now: 30_000, cache, probe });
    expect(first).toEqual({ connected: true, team: { key: "THI", name: "Thiga_case_study" } });
    expect(second).toEqual(first);
    expect(calls).toBe(1);
    expect(JSON.stringify(first)).not.toContain(KEY);
  });

  it("est déconnecté sans clé, sans appeler Linear", async () => {
    const cache = memoryLinearStatusCache();
    let calls = 0;
    const status = await resolveLinearStatus({
      apiKey: "  ",
      teamId: "THI",
      now: 0,
      cache,
      probe: async () => {
        calls += 1;
        return { key: "THI", name: "X" };
      },
    });
    expect(status).toEqual({ connected: false, reason: "absent" });
    expect(calls).toBe(0);
  });

  it("est déconnecté si Linear échoue, sans recopier la clé", async () => {
    const cache = memoryLinearStatusCache();
    const status = await resolveLinearStatus({
      apiKey: KEY,
      teamId: "THI",
      now: 0,
      cache,
      probe: async () => {
        throw new Error(`unauthorized ${KEY}`);
      },
    });
    expect(status).toEqual({ connected: false, reason: "injoignable" });
    expect(JSON.stringify(status)).not.toContain(KEY);
  });

  it("n'attend pas une requête qui ne revient pas", async () => {
    const cache = memoryLinearStatusCache();
    const started = Date.now();
    const status = await resolveLinearStatus({
      apiKey: KEY,
      teamId: "THI",
      now: 0,
      cache,
      timeoutMs: 30,
      probe: (_key, _team, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    expect(status).toEqual({ connected: false, reason: "injoignable" });
    expect(Date.now() - started).toBeLessThan(500);
  });
});
