import type { LinearTeamChoice } from "./connect";

export function teamOptionLabel(team: Pick<LinearTeamChoice, "name" | "key">): string {
  return `${team.name} · ${team.key}`;
}

export function sortTeams(teams: readonly LinearTeamChoice[]): LinearTeamChoice[] {
  return [...teams].sort(
    (a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) || a.key.localeCompare(b.key, "fr", { sensitivity: "base" }),
  );
}

/** Le nom ou la clé, l'un ou l'autre, sans tenir compte de la casse. */
export function teamMatches(team: Pick<LinearTeamChoice, "name" | "key">, query: string): boolean {
  const q = query.trim().toLocaleLowerCase("fr");
  if (!q) return true;
  return team.name.toLocaleLowerCase("fr").includes(q) || team.key.toLocaleLowerCase("fr").includes(q);
}

export function filterTeams(teams: readonly LinearTeamChoice[], query: string): LinearTeamChoice[] {
  return sortTeams(teams.filter((team) => teamMatches(team, query)));
}

/**
 * Une seule équipe : on la prend. Sinon l'équipe déjà choisie, si elle est encore dans la liste.
 */
export function chosenTeamId(teams: readonly LinearTeamChoice[], currentId: string | null | undefined): string | null {
  if (teams.length === 1) return teams[0]?.id ?? null;
  if (currentId && teams.some((team) => team.id === currentId)) return currentId;
  return null;
}

export interface TeamPage {
  nodes: LinearTeamChoice[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/** Enchaîne les pages Linear (50 par page) jusqu'à la dernière. */
export async function collectTeamPages(fetchPage: (after: string | undefined) => Promise<TeamPage>): Promise<LinearTeamChoice[]> {
  const teams: LinearTeamChoice[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < 40; page += 1) {
    const result = await fetchPage(after);
    for (const team of result.nodes) {
      if (seen.has(team.id)) continue;
      seen.add(team.id);
      teams.push(team);
    }
    if (!result.hasNextPage || !result.endCursor || result.endCursor === after) break;
    after = result.endCursor;
  }
  return sortTeams(teams);
}
