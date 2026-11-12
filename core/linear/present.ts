import { linearBadgeHint, linearBadgeLabel, type LinearBadgeTeam } from "./badge";

export const CONNECT_LINEAR = "Connecter Linear";

export interface LinearVisitor {
  personalKey: boolean;
  team: LinearBadgeTeam | null;
}

export interface LinearView {
  label: string;
  tone: "neutre" | "vert";
  hint: string;
  phase: "cle" | "gestion";
}

/** Le vert n'apparaît qu'avec une clé personnelle. */
export function presentLinear(input: LinearVisitor): LinearView {
  if (input.personalKey) {
    return {
      label: linearBadgeLabel(input.team),
      tone: "vert",
      hint: linearBadgeHint(input.team) || "Clé personnelle enregistrée dans ce navigateur.",
      phase: "gestion",
    };
  }
  return {
    label: CONNECT_LINEAR,
    tone: "neutre",
    hint: "Collez une clé Linear pour choisir votre équipe.",
    phase: "cle",
  };
}
