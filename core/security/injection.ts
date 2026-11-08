/**
 * Filet déterministe, avant et indépendamment du LLM. Il ne décide pas seul de ce qui est vrai :
 * il met de côté ce qui ressemble à une consigne adressée à l'agent.
 * Le LLM de classification peut aussi lever le drapeau ; l'un ou l'autre suffit à la quarantaine.
 */
const RULES: { id: string; regex: RegExp }[] = [
  {
    id: "ignorer_consignes",
    regex:
      /\b(?:ignore[rsz]?|oublie[rsz]?)\b[^.\n]{0,30}\b(?:instructions?|consignes?|règles?|regles?)\b/i,
  },
  {
    id: "ignore_instructions_en",
    regex: /\b(?:ignore|forget)\b[^.\n]{0,30}\b(?:instructions?|rules?|prompt|message above)\b/i,
  },
  { id: "disregard", regex: /\bdisregard\b/i },
  { id: "role_systeme", regex: /(?:^|\n)\s*>?\s*(?:system|assistant|développeur|developer)\s*:/i },
  { id: "changement_de_role", regex: /\b(?:tu es maintenant|you are now|mode libre|developer mode)\b/i },
  {
    id: "note_a_l_agent",
    regex:
      /\b(?:note|message|instructions?)\s+(?:for|to|pour|à)\s+(?:the\s+|l'|l’)?(?:writing\s+)?(?:assistant|ai|ia|model|modèle|agent|llm)\b/i,
  },
  {
    id: "score_force",
    regex:
      /\b(?:score|rice|impact|confidence|confiance|priorité|priority)\b[^.\n]{0,20}\b(?:de|of|to|à|=|:)\s*\d{3,}\b|\b(?:impact|confidence|confiance)\s+(?:to|à|=)\s*\d+/i,
  },
  {
    id: "classe_forcee",
    regex: /\b(?:classe|classer|mets|mettre|set|mark|put)\b[^.\n]{0,60}\b(?:en|as|to|in)\s+(?:must|priorit[ée] (?:numéro )?(?:un|1))\b/i,
  },
  {
    id: "exfiltration",
    regex:
      /\b(?:envoie|envoyer|transf[èe]re[rz]?|email|e-mail|send|forward|post|publie[rz]?)\b[^.\n]{0,80}\b(?:liste|list|ARR|contacts?|adresses|addresses|all (?:customer|feedback)s?|tous les (?:clients|feedbacks))\b/i,
  },
  { id: "envoi_vers_url", regex: /\b(?:send|envoie|post|upload)\b[^.\n]{0,120}https?:\/\//i },
  {
    id: "dissimulation",
    regex:
      /\b(?:do not|don't|ne pas|ne le dis pas|sans le dire)\b[^.\n]{0,40}\b(?:show|tell|montrer|afficher|dire|signaler)\b[^.\n]{0,40}\b(?:product owner|PO|user|utilisateur)\b/i,
  },
];

export interface InjectionScreen {
  signals: string[];
}

export function screenForInjection(text: string): InjectionScreen {
  return { signals: RULES.filter((r) => r.regex.test(text)).map((r) => r.id) };
}
