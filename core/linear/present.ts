import { safeNextPath } from "../auth/gate";
import { linearBadgeHint, linearBadgeLabel, type LinearBadgeTeam } from "./badge";

export const CONNECT_LINEAR = "Connecter Linear";
export const KEY_STEP = "cle";

export interface LinearVisitor {
  hasSession: boolean;
  /** Une clé personnelle est déjà dans ce navigateur. */
  personalKey: boolean;
  team: LinearBadgeTeam | null;
  requestedStep: string | null;
}

export interface LinearView {
  label: string;
  tone: "neutre" | "vert";
  hint: string;
  phase: "compte" | "cle" | "gestion";
  stepLabel: "1/2" | "2/2" | null;
  /** Le retour du lien (?etape=cle) rouvre la modale sur la clé. */
  reopen: boolean;
}

/**
 * Le vert n'apparaît qu'avec une clé personnelle.
 * Une session sans clé laisse le bouton neutre et ouvre directement l'étape 2.
 */
export function presentLinear(input: LinearVisitor): LinearView {
  if (input.personalKey) {
    return {
      label: linearBadgeLabel(input.team),
      tone: "vert",
      hint: linearBadgeHint(input.team) || "Clé personnelle enregistrée dans ce navigateur.",
      phase: "gestion",
      stepLabel: null,
      reopen: false,
    };
  }
  const signedIn = input.hasSession;
  return {
    label: CONNECT_LINEAR,
    tone: "neutre",
    hint: signedIn ? "Collez une clé Linear pour choisir votre équipe." : "Recevez un lien, puis collez une clé Linear.",
    phase: signedIn ? "cle" : "compte",
    stepLabel: signedIn ? "2/2" : "1/2",
    reopen: signedIn && input.requestedStep === KEY_STEP,
  };
}

/** Le lien magique revient sur la page, et rouvre l'étape de la clé. */
export function withKeyStep(path: string): string {
  const url = new URL(safeNextPath(path), "http://etai.local");
  url.searchParams.set("etape", KEY_STEP);
  return `${url.pathname}${url.search}`;
}
