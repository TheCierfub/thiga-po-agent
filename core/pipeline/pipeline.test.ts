import path from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { loadPoDecisions } from "../data/load";
import { EMPTY_PO_DECISIONS } from "../decisions/po-decisions";
import { ReplayProvider } from "../llm/fixtures";
import type { LlmProvider, LlmRequest } from "../llm/provider";
import { ROOT } from "../test/helpers";
import { runBatch } from "./run";

class SpyProvider implements LlmProvider {
  readonly name = "spy";
  readonly prompts: string[] = [];
  constructor(private readonly inner: LlmProvider) {}
  async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    this.prompts.push(request.prompt);
    return this.inner.generate(request);
  }
}

const decisions = loadPoDecisions(ROOT, "data/po-decisions.json");
const replay = () => new SpyProvider(new ReplayProvider(path.join(ROOT, "fixtures/llm")));
const moscowOf = (r: Awaited<ReturnType<typeof runBatch>>) =>
  Object.fromEntries(r.state.allocation.decisions.map((d) => [d.themeKey, d.moscow]));

describe("pipeline rejoué de bout en bout", async () => {
  const provider = replay();
  const lundi = await runBatch({ root: ROOT, batch: "lundi", provider, reachMode: "comptes", decisions, previous: null });
  const jeudi = await runBatch({ root: ROOT, batch: "jeudi", provider, reachMode: "comptes", decisions, previous: lundi.state });

  it("aucun prompt ne contient de donnée personnelle", () => {
    const all = provider.prompts.join("\n");
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(all).not.toMatch(/0[67](?:[ .]?\d{2}){4}/);
    expect(all).toContain("[ADRESSE]");
  });

  it("lundi : allocation attendue, injections en quarantaine, story et investigation", () => {
    expect(moscowOf(lundi)).toEqual({
      synchro_2_4: "Must",
      sso_contrat: "Must",
      partage_client: "Should",
      notifications: "Could",
      epingle_photo: "Won't",
      theme_sombre: "Won't",
    });
    expect(lundi.state.allocation.alerts.map((a) => a.code)).toEqual(["MUST_AU_DELA_DE_60"]);
    expect(lundi.state.classifications.filter((c) => c.injection.quarantined).map((c) => c.feedbackId).sort()).toEqual([
      "fb-lundi-26",
      "fb-lundi-36",
    ]);
    expect(lundi.story?.themeKey).toBe("sso_contrat");
    expect(lundi.state.investigations.map((i) => i.feedbackId)).toEqual(["fb-lundi-12"]);
    expect(lundi.state.warnings).toEqual([]);
  });

  it("jeudi : ne reclasse que les nouveaux et explique les mouvements", () => {
    expect(jeudi.newFeedbackIds).toHaveLength(12);
    const m = moscowOf(jeudi);
    expect(m.notifications).toBe("Should");
    expect(m.notes_internes).toBe("Hors arbitrage");
    expect(m.epingle_photo).toBe("Won't");
    const notif = jeudi.changes!.themes.find((t) => t.key === "notifications")!;
    expect(notif.moscowBefore).toBe("Could");
    expect(notif.accountsAdded).toEqual(["acc-rivage"]);
    const partage = jeudi.changes!.themes.find((t) => t.key === "partage_client")!;
    expect(partage.accountsRemoved.map((a) => a.accountId)).toEqual(["acc-kervel"]);
    expect(jeudi.changes!.plan.unchanged).toEqual(["epingle_photo"]);
    expect(jeudi.changes!.plan.staleConfirmations.sort()).toEqual(["sso_contrat", "synchro_2_4"]);
  });

  it("l'état conservé ne contient ni texte brut ni e-mail d'auteur", () => {
    const f28 = jeudi.state.feedbacks.find((f) => f.id === "fb-lundi-28")!;
    expect(f28.text).toBe(f28.maskedText);
    expect(jeudi.state.feedbacks.every((f) => f.author.email === null)).toBe(true);
  });

  it("sans confirmation du PO, une contrainte reste « À confirmer » et ne prend pas de capacité", async () => {
    const r = await runBatch({ root: ROOT, batch: "lundi", provider: replay(), reachMode: "comptes", decisions: EMPTY_PO_DECISIONS, previous: null, draftStory: false });
    expect(moscowOf(r).sso_contrat).toBe("À confirmer");
    expect(moscowOf(r).synchro_2_4).toBe("À confirmer");
    expect(r.state.allocation.mustPoints).toBe(0);
  });
});
