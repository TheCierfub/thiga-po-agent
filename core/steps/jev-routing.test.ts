import { describe, expect, it } from "vitest";
import type { DecisionEngine, DecisionRequest } from "../llm/decisions";
import { ScriptedProvider } from "../llm/scripted";
import type { MaskedFeedback } from "../schemas";
import { shouldReassessTheme } from "../scoring/rice";
import { exactExcerpt, classifyFeedback } from "./classify";
import { DEFAULT_THEME_CONFIDENCE, formatAttachmentReason, themeChoiceIsConfident } from "./decide";

const feedback: MaskedFeedback = {
  id: "fb-direct-1",
  batch: "jeudi",
  channel: "email",
  receivedAt: "2026-11-09T17:41:37.000Z",
  author: { name: "Inès Quai", email: null, handle: null, anonymous: false },
  sourceAccountId: "acc-quai",
  language: "fr",
  text: "Les notifications arrivent en double. On veut choisir les alertes selon le rôle.",
  maskedText: "Les notifications arrivent en double. On veut choisir les alertes selon le rôle.",
  pii: [],
};

describe("Jev ne décide pas deux fois", () => {
  it("n'appelle pas Sonnet pour classer quand le type, l'injection et la gravité sont déjà à Jev", async () => {
    const calls: DecisionRequest[] = [];
    const engine: DecisionEngine = {
      name: "decisions:typesafe/jev-1.14",
      async decide(request) {
        calls.push(request);
        const answers: Record<string, { type: "choice"; choice: string; probabilities: null; confidence: number } | { type: "noul"; probability: number }> = {};
        for (const [id, question] of Object.entries(request.questions)) {
          if (question.type === "noul") answers[id] = { type: "noul", probability: 0.02 };
          else if (id === "theme") answers[id] = { type: "choice", choice: "notifications", probabilities: null, confidence: 0.87 };
          else if (id === "type") answers[id] = { type: "choice", choice: "bug", probabilities: null, confidence: 0.9 };
          else answers[id] = { type: "choice", choice: "majeure", probabilities: null, confidence: 0.8 };
        }
        return { engine: engine.name, answers, fallbackUsed: false };
      },
    };
    const provider = new ScriptedProvider({});
    const out = await classifyFeedback(feedback, provider, [], { type: engine, injection: engine, critical: engine, theme: engine }, [
      { key: "notifications", title: "Notifications", problem: "Trop de notifications." },
    ]);
    expect(provider.requests).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!.questions).sort()).toEqual(["critical", "injection", "theme", "type"]);
    expect(out.type).toBe("bug");
    expect(out.themeChoice?.themeKey).toBe("notifications");
    expect(out.quotes[0]?.text).toBe(exactExcerpt(feedback.maskedText));
    expect(out.decisions?.type?.engine).toContain("jev");
  });

  it("ne rattache pas sous le seuil, ni sur un repli", () => {
    const base = { probability: null, probabilities: null, engine: "jev", themeKey: "notifications" as string | null, fallbackUsed: false, confidence: 0.79 };
    expect(themeChoiceIsConfident({ ...base, confidence: 0.8 }, DEFAULT_THEME_CONFIDENCE)).toBe(true);
    expect(themeChoiceIsConfident(base, DEFAULT_THEME_CONFIDENCE)).toBe(false);
    expect(themeChoiceIsConfident({ ...base, themeKey: null, confidence: 0.95 }, DEFAULT_THEME_CONFIDENCE)).toBe(false);
    expect(themeChoiceIsConfident({ ...base, fallbackUsed: true, confidence: 0.95 }, DEFAULT_THEME_CONFIDENCE)).toBe(false);
    expect(shouldReassessTheme(true, 1, 1)).toBe(true);
    expect(shouldReassessTheme(false, 1, 1)).toBe(false);
    expect(shouldReassessTheme(false, 0.8, 1)).toBe(true);
    const reason = formatAttachmentReason({
      themeKey: "notifications",
      themeTitle: "Régler la fréquence des notifications selon le rôle",
      confidence: 1,
      probability: 1,
      probabilities: { notifications: 1, epingle_photo: 0.04 },
      titles: new Map([["epingle_photo", "Montrer l'endroit d'une réserve sur la photo"]]),
    });
    expect(reason).toBe(
      "Rattaché par Jev (confiance 1,00) : même problème que les feedbacks du thème « Régler la fréquence des notifications selon le rôle ». 2e choix : Montrer l'endroit d'une réserve sur la photo, 0,04.",
    );
    expect(reason).not.toContain("typesafe");
  });
});
