import { describe, expect, it } from "vitest";
import { chosenTeamId, collectTeamPages, filterTeams, sortTeams, type TeamPage } from "./teams";
import type { LinearTeamChoice } from "./connect";

function team(index: number, name: string, key: string): LinearTeamChoice {
  return { id: `team-${key.toLowerCase()}`, key, name };
}

/** 40 équipes d'un espace fictif, dont Produit, Mobile et Plateforme. */
function acmeTeams(): LinearTeamChoice[] {
  const named = [team(0, "Produit", "PRO"), team(1, "Mobile", "MOB"), team(2, "Plateforme", "PLT")];
  const rest = Array.from({ length: 37 }, (_, index) => team(index + 3, `Atelier ${String(index).padStart(2, "0")}`, `A${String(index).padStart(2, "0")}`));
  return [...rest, ...named];
}

describe("équipes Linear", () => {
  it("filtre 40 équipes par nom ou par clé, et trie le reste", () => {
    const teams = acmeTeams();
    expect(teams).toHaveLength(40);
    expect(filterTeams(teams, "mob").map((item) => item.name)).toEqual(["Mobile"]);
    expect(filterTeams(teams, "PLT").map((item) => item.key)).toEqual(["PLT"]);
    expect(filterTeams(teams, "prod")).toEqual([expect.objectContaining({ name: "Produit", key: "PRO" })]);
    expect(filterTeams(teams, "")).toHaveLength(40);
    expect(sortTeams(teams).map((item) => item.name).slice(0, 2)).toEqual(["Atelier 00", "Atelier 01"]);
    expect(sortTeams(teams).map((item) => item.name)).toContain("Plateforme");
  });

  it("sélectionne l'unique équipe, sinon celle déjà choisie", () => {
    const only = [{ id: "team-pro", key: "PRO", name: "Produit" }];
    expect(chosenTeamId(only, null)).toBe("team-pro");
    const teams = acmeTeams();
    expect(chosenTeamId(teams, "team-mob")).toBe("team-mob");
    expect(chosenTeamId(teams, "absente")).toBeNull();
    expect(chosenTeamId(teams, null)).toBeNull();
  });

  it("lit les pages au-delà de 50 équipes", async () => {
    const all = Array.from({ length: 65 }, (_, index) => ({
      id: `id-${index}`,
      key: `K${String(index).padStart(2, "0")}`,
      name: `Équipe ${String(index).padStart(2, "0")}`,
    }));
    const calls: Array<string | undefined> = [];
    const collected = await collectTeamPages(async (after) => {
      calls.push(after);
      const start = after ? Number(after) : 0;
      const nodes = all.slice(start, start + 50);
      const next = start + nodes.length;
      const page: TeamPage = { nodes, hasNextPage: next < all.length, endCursor: next < all.length ? String(next) : null };
      return page;
    });
    expect(calls).toEqual([undefined, "50"]);
    expect(collected).toHaveLength(65);
    expect(collected[0]?.name.localeCompare(collected[1]?.name ?? "", "fr", { sensitivity: "base" })).toBeLessThanOrEqual(0);
  });
});
