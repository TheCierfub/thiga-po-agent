import { describe, expect, it } from "vitest";
import type { Quote } from "../schemas";
import { ATTACHMENT_RULES, buildAttachmentPrompt, resolveAttachment, type AttachmentInput, type AttachmentProposal } from "./attach";

const quote = (text: string): Quote => ({ feedbackId: "fb-direct-1", text });

function proposal(patch: Partial<AttachmentProposal>): AttachmentProposal {
  return {
    action: "creer",
    themeKey: "notifications_doublon",
    title: "Notifications de retard reçues en double",
    problem: "Les alertes de retard arrivent en double.",
    rationale: "Le modèle propose un thème neuf.",
    relatedThemeIds: [],
    comparisons: [{ themeKey: "notifications", sameProblem: true, why: "Même besoin : choisir les alertes selon le rôle." }],
    backlogIssueId: null,
    backlogRelation: "aucun",
    quotes: [quote("choisir quelles alertes")],
    ...patch,
  };
}

const input: AttachmentInput = {
  batch: "jeudi",
  feedback: {
    id: "fb-direct-1",
    batch: "jeudi",
    channel: "email",
    receivedAt: "2026-11-09T17:41:37.000Z",
    author: { name: "Inès Quai", email: null, handle: null, anonymous: false },
    sourceAccountId: "acc-quai",
    language: "fr",
    text: "Les notifications arrivent en double.",
    maskedText: "Les notifications arrivent en double.",
    pii: [],
  },
  classification: {
    feedbackId: "fb-direct-1",
    type: "bug",
    severity: "majeure",
    underlyingProblem: "Les notifications de retard arrivent en double.",
    actionable: true,
    injection: { llmSuspected: false, heuristicSignals: [], quarantined: false, releasedByPo: false },
    quotes: [],
    rejectedQuotes: [],
  },
  backlog: [
    {
      id: "LIN-27",
      titre: "Réglage des notifications",
      description: "Fréquence par rôle.",
      statut: "À faire",
      priorite: "Moyenne",
      estimation: "S",
      points: 2,
    },
  ],
  existingThemes: [
    {
      key: "notifications",
      title: "Régler la fréquence des notifications selon le rôle",
      problem: "Les notifications ne correspondent pas au rôle.",
      quotes: ["trop de mails pour les uns"],
      backlogIssueId: "LIN-27",
    },
    {
      key: "theme_sombre",
      title: "Thème sombre pour la saisie du soir",
      problem: "L'écran blanc éblouit.",
      quotes: ["l'écran blanc m'éblouit"],
      backlogIssueId: null,
    },
  ],
};

describe("rattachement à un thème existant", () => {
  it("met dans le prompt chaque thème, ses citations et la règle qui interdit un thème isolé", () => {
    const prompt = buildAttachmentPrompt(input);
    expect(prompt).toContain("Thème notifications : Régler la fréquence des notifications selon le rôle");
    expect(prompt).toContain("Résumé : Les notifications ne correspondent pas au rôle.");
    expect(prompt).toContain("« trop de mails pour les uns »");
    expect(prompt).toContain("Thème theme_sombre : Thème sombre pour la saisie du soir");
    expect(prompt).toContain("« l'écran blanc m'éblouit »");
    expect(prompt).toContain(ATTACHMENT_RULES);
    expect(prompt).toContain("fb-direct-1");
    expect(prompt).not.toContain("Je prépare les métrés");
    expect(prompt).toMatchSnapshot();
  });

  it("rattache d'office si le modèle crée un thème isolé pour un problème déjà ouvert", () => {
    const resolved = resolveAttachment(proposal({}), new Set(["notifications", "theme_sombre"]));
    expect(resolved).toMatchObject({ action: "rattacher", themeKey: "notifications", forced: true, relatedThemeIds: [] });
    expect(resolved.rationale).toContain("notifications");
  });

  it("garde un thème bug nouveau s'il est lié au thème proche", () => {
    const resolved = resolveAttachment(
      proposal({ relatedThemeIds: ["notifications"], themeKey: "notifications_doublon" }),
      new Set(["notifications", "theme_sombre"]),
    );
    expect(resolved).toMatchObject({
      action: "creer",
      themeKey: "notifications_doublon",
      forced: false,
      relatedThemeIds: ["notifications"],
    });
  });

  it("crée un thème seulement si aucune comparaison ne reconnaît le problème", () => {
    const resolved = resolveAttachment(
      proposal({
        themeKey: "hors_ligne",
        comparisons: [{ themeKey: "notifications", sameProblem: false, why: "Ce n'est pas le réglage des alertes." }],
        rationale: "Aucun thème ne parle de travailler sans réseau.",
      }),
      new Set(["notifications"]),
    );
    expect(resolved).toMatchObject({ action: "creer", themeKey: "hors_ligne", forced: false, relatedThemeIds: [] });
  });
});
