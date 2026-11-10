/** Champs lus sur Linear. Aucun nom d'équipe n'est écrit ici. */
export interface LinearBadgeTeam {
  name?: string | null;
  key?: string | null;
  workspaceName?: string | null;
}

/** « Linear connecté · Produit », ou « Linear connecté » si le nom manque. */
export function linearBadgeLabel(team: LinearBadgeTeam | null | undefined): string {
  const name = team?.name?.trim();
  return name ? `Linear connecté · ${name}` : "Linear connecté";
}

/** « Espace Acme, équipe Produit (PRO) ». Vide si Linear n'a rien renvoyé. */
export function linearBadgeHint(team: LinearBadgeTeam | null | undefined): string {
  const space = team?.workspaceName?.trim();
  const name = team?.name?.trim();
  const key = team?.key?.trim();
  const teamPart = name ? `équipe ${name}${key ? ` (${key})` : ""}` : key ? `équipe ${key}` : "";
  if (space && teamPart) return `Espace ${space}, ${teamPart}`;
  if (space) return `Espace ${space}`;
  return teamPart;
}

/** « Connecté à Acme en tant que Camille Martin ». */
export function linearAccountLine(workspaceName: string | null | undefined, viewerName: string | null | undefined): string | null {
  const space = workspaceName?.trim();
  const person = viewerName?.trim();
  if (!space || !person) return null;
  return `Connecté à ${space} en tant que ${person}`;
}
