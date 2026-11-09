import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBatchFile, loadContext, loadPoDecisions } from "../data/load";
import { ReplayProvider } from "../llm/fixtures";
import { ScriptedProvider } from "../llm/scripted";
import { ingestBatch } from "../ingest/connectors";
import { NO_OVERRIDES } from "../scoring/overrides";
import { ROOT } from "../test/helpers";
import { MemoryStore } from "../store/memory";
import { StoreError } from "../store/types";
import { runBatch } from "./run";
import { buildDirectFeedback, ingestDirectFeedback } from "./direct";

const decisions = loadPoDecisions(ROOT, "data/po-decisions.json");
const context = loadContext(ROOT);

const ASSESS = {
  category: "amelioration",
  categoryRationale: "Les notifications existent ; il s'agit d'en régler la fréquence par rôle.",
  impact: 1,
  impactRationale: "Gêne quotidienne, déjà portée par plusieurs comptes.",
  okrId: null,
  effortSize: "S",
  referenceStoryId: "LIN-076",
  effortRationale: "L'envoi existe déjà, c'est un réglage.",
  constraint: null,
  strategyFit: "neutre",
  strategyRationale: "Ne sert pas directement un OKR du trimestre.",
};

function scripted(responses: Record<string, unknown>) {
  return new ScriptedProvider(responses);
}

describe("ajout d'un feedback en direct", async () => {
  const replay = new ReplayProvider(path.join(ROOT, "fixtures/llm"));
  const lundi = await runBatch({ root: ROOT, batch: "lundi", provider: replay, reachMode: "comptes", decisions, previous: null });
  const jeudi = await runBatch({ root: ROOT, batch: "jeudi", provider: replay, reachMode: "comptes", decisions, previous: lundi.state });
  const corpus = [...ingestBatch(loadBatchFile(ROOT, "lundi")), ...ingestBatch(loadBatchFile(ROOT, "jeudi"))];

  async function seeded() {
    const store = new MemoryStore();
    await store.resetDemo({
      feedbacks: corpus,
      runs: [lundi, jeudi].map((result) => ({
        state: result.state,
        newFeedbackIds: result.newFeedbackIds,
        changes: result.changes,
      })),
      arbitrages: ["lundi", "jeudi"].map((batch) => ({ batch, value: { decisions, overrides: NO_OVERRIDES } })),
    });
    return store;
  }

  it("rattache le feedback à un thème existant sans reclasser le corpus", async () => {
    const store = await seeded();
    const feedback = buildDirectFeedback(
      {
        channel: "email",
        sourceAccountId: "acc-maree",
        authorName: "Jean Marée",
        language: "fr",
        text: "Les notifications partent encore à tout le monde. Il nous faut un résumé quotidien par rôle.",
      },
      new Date("2026-11-06T18:00:00+01:00"),
      "maree",
    );
    const provider = scripted({
      [`classify/${feedback.id}`]: {
        type: "friction",
        severity: null,
        injection: { suspected: false, excerpt: null },
        underlyingProblem: "Trop de notifications, sans réglage par rôle.",
        actionable: true,
        quotes: ["Il nous faut un résumé quotidien par rôle"],
      },
      "group/jeudi": {
        themes: [
          {
            key: "notifications",
            title: "Notifications par rôle",
            problem: "Les notifications ne correspondent pas au rôle.",
            feedbackIds: [feedback.id],
            relatedSignalIds: [],
            backlogIssueId: null,
            backlogRelation: "aucun",
            quotes: [{ feedbackId: feedback.id, text: "Il nous faut un résumé quotidien par rôle" }],
          },
        ],
      },
      "assess/jeudi--notifications": ASSESS,
    });

    const { result } = await ingestDirectFeedback({ store, feedback, provider, decisions, context });
    const tasks = provider.requests.map((request) => `${request.task}/${request.key}`);
    expect(tasks.filter((task) => task.startsWith("classify/"))).toEqual([`classify/${feedback.id}`]);
    expect(tasks.filter((task) => task.startsWith("assess/"))).toEqual(["assess/jeudi--notifications"]);
    expect(tasks.some((task) => task.startsWith("story/"))).toBe(false);
    const prompts = provider.requests.map((request) => request.prompt).join("\n");
    expect(prompts).not.toContain("l'écran blanc m'éblouit");

    const theme = result.state.themes.find((item) => item.key === "notifications");
    expect(theme?.feedbackIds).toContain(feedback.id);
    expect(result.state.matches.find((match) => match.feedbackId === feedback.id)).toMatchObject({
      accountId: "acc-maree",
      confidence: "certaine",
      method: "saisie_po",
    });
    const before = jeudi.state.rice.find((score) => score.themeKey === "notifications")!;
    const after = result.state.rice.find((score) => score.themeKey === "notifications")!;
    expect(after.reach.messages).toBe(before.reach.messages + 1);
    expect(after.reach.accounts).toContain("acc-maree");
    expect(after.score).not.toBe(before.score);

    for (const assessment of jeudi.state.assessments) {
      if (assessment.themeKey === "notifications") continue;
      expect(result.state.assessments.find((item) => item.themeKey === assessment.themeKey)).toEqual(assessment);
    }

    const stored = await store.getRun("jeudi");
    expect(stored?.state.feedbacks.find((item) => item.id === feedback.id)?.author.email).toBeNull();
    expect(stored?.newFeedbackIds).toEqual([feedback.id]);
    const raw = await store.listFeedbacks("lundi");
    expect(raw.find((row) => row.feedback.id === "fb-lundi-01")?.feedback.author.email).toBe("jean.maree@maree-fils.example");
    expect((await store.listFeedbacks()).find((row) => row.feedback.id === feedback.id)?.origin).toBe("direct");
  });

  it("ouvre un thème nouveau et recalcule le classement", async () => {
    const store = await seeded();
    const feedback = buildDirectFeedback(
      {
        channel: "ticket_support",
        sourceAccountId: "acc-nordbois",
        authorName: "Léo Nord",
        language: "fr",
        text: "Dans le sous-sol le réseau ne passe pas. On veut cocher l'avancement hors ligne.",
      },
      new Date("2026-11-06T18:30:00+01:00"),
      "nord",
    );
    const provider = scripted({
      [`classify/${feedback.id}`]: {
        type: "demande",
        severity: null,
        injection: { suspected: false, excerpt: null },
        underlyingProblem: "Impossible de saisir l'avancement sans réseau.",
        actionable: true,
        quotes: ["cocher l'avancement hors ligne"],
      },
      "group/jeudi": {
        themes: [
          {
            key: "hors_ligne",
            title: "Saisie hors ligne",
            problem: "La saisie de l'avancement exige un réseau.",
            feedbackIds: [feedback.id],
            relatedSignalIds: [],
            backlogIssueId: null,
            backlogRelation: "aucun",
            quotes: [{ feedbackId: feedback.id, text: "cocher l'avancement hors ligne" }],
          },
        ],
      },
      "assess/jeudi--hors_ligne": ASSESS,
    });

    const { result } = await ingestDirectFeedback({ store, feedback, provider, decisions, context });
    expect(result.changes?.plan.newThemes).toContain("hors_ligne");
    expect(result.state.themes.map((theme) => theme.key)).toContain("hors_ligne");
    expect(result.state.rice.find((score) => score.themeKey === "hors_ligne")?.reach.accounts).toEqual(["acc-nordbois"]);
    const previous = new Map(jeudi.state.allocation.decisions.map((decision) => [decision.themeKey, decision.moscow]));
    const moved = result.changes?.themes.filter((theme) => theme.moscowBefore !== theme.moscowAfter) ?? [];
    expect(result.state.allocation.decisions.find((decision) => decision.themeKey === "hors_ligne")?.moscow).toBeTruthy();
    expect(previous.get("notifications")).toBe(result.state.allocation.decisions.find((d) => d.themeKey === "notifications")?.moscow);
    expect(moved.map((theme) => theme.key)).not.toContain("epingle_photo");
  });

  it("n'écrit rien si le modèle ne répond pas", async () => {
    const store = await seeded();
    const feedback = buildDirectFeedback(
      {
        channel: "forum_produit",
        sourceAccountId: null,
        authorName: null,
        language: "fr",
        text: "Un commentaire sans réponse du modèle, assez long pour passer la validation.",
      },
      new Date("2026-11-06T19:00:00+01:00"),
      "vide",
    );
    await expect(
      ingestDirectFeedback({ store, feedback, provider: scripted({}), decisions, context }),
    ).rejects.toThrow(/Pas de réponse scriptée/);
    expect(store.hasFeedback(feedback.id)).toBe(false);
    expect((await store.getRun("jeudi"))?.state.feedbacks.some((item) => item.id === feedback.id)).toBe(false);
  });

  it("retire le feedback brut si l'enregistrement de l'analyse échoue", async () => {
    const store = await seeded();
    store.saveRun = async () => {
      throw new StoreError("écriture refusée");
    };
    const feedback = buildDirectFeedback(
      {
        channel: "email",
        sourceAccountId: "acc-maree",
        authorName: "Jean Marée",
        language: "fr",
        text: "Les notifications partent encore à tout le monde. Il nous faut un résumé quotidien par rôle.",
      },
      new Date("2026-11-06T18:00:00+01:00"),
      "echec",
    );
    const provider = scripted({
      [`classify/${feedback.id}`]: {
        type: "friction",
        severity: null,
        injection: { suspected: false, excerpt: null },
        underlyingProblem: "Trop de notifications.",
        actionable: true,
        quotes: ["Il nous faut un résumé quotidien par rôle"],
      },
      "group/jeudi": {
        themes: [
          {
            key: "notifications",
            title: "Notifications par rôle",
            problem: "Les notifications ne correspondent pas au rôle.",
            feedbackIds: [feedback.id],
            relatedSignalIds: [],
            backlogIssueId: null,
            backlogRelation: "aucun",
            quotes: [{ feedbackId: feedback.id, text: "Il nous faut un résumé quotidien par rôle" }],
          },
        ],
      },
      "assess/jeudi--notifications": ASSESS,
    });
    await expect(ingestDirectFeedback({ store, feedback, provider, decisions, context })).rejects.toBeInstanceOf(StoreError);
    expect(store.hasFeedback(feedback.id)).toBe(false);
  });
});
