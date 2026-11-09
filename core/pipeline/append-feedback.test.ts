import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBatchFile, loadContext, loadPoDecisions } from "../data/load";
import { FallbackDecisionEngine, type DecisionEngine, type DecisionRequest, type DecisionResult } from "../llm/decisions";
import { ReplayProvider } from "../llm/fixtures";
import type { DecisionPlan } from "../llm/profiles";
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

function jevEngine(theme: string, confidence: number | null, fail = false, probabilities?: Record<string, number>) {
  const calls: DecisionRequest[] = [];
  const fallbacks = { n: 0 };
  const answer = (request: DecisionRequest, conf: number | null, fallbackUsed: boolean): DecisionResult => {
    const answers: DecisionResult["answers"] = {};
    for (const [id, question] of Object.entries(request.questions)) {
      if (question.type === "noul") answers[id] = { type: "noul", probability: 0.05 };
      else if (id === "theme") {
        answers[id] = { type: "choice", choice: theme, probabilities: probabilities ?? { [theme]: conf ?? 0.4 }, confidence: conf };
      }
      else if (id === "type") answers[id] = { type: "choice", choice: "bug", probabilities: null, confidence: 0.9 };
      else if (id === "critical") answers[id] = { type: "choice", choice: "majeure", probabilities: null, confidence: 0.9 };
      else answers[id] = { type: "choice", choice: Object.keys(question.options)[0]!, probabilities: null, confidence: 0.9 };
    }
    return { engine: fallbackUsed ? "llm:sonnet" : "decisions:typesafe/jev-1.14", answers, fallbackUsed };
  };
  const primary: DecisionEngine = {
    name: "jev",
    async decide(request) {
      calls.push(request);
      if (fail) throw new Error("jev indisponible");
      return answer(request, confidence, false);
    },
  };
  const engine = fail
    ? new FallbackDecisionEngine(primary, { name: "sonnet", decide: async (request) => answer(request, null, true) }, () => {
        fallbacks.n += 1;
      })
    : primary;
  const plan: DecisionPlan = { type: engine, injection: engine, critical: engine, theme: engine };
  return { plan, calls, fallbacks };
}

function attachToNotifications(feedbackId: string, quote: string) {
  return {
    comparisons: [{ themeKey: "notifications", sameProblem: true, why: "Même problème : le volume et le rôle des notifications." }],
    decision: {
      action: "rattacher" as const,
      themeKey: "notifications",
      title: "Régler la fréquence des notifications selon le rôle",
      problem: "Les notifications ne correspondent pas au rôle.",
      rationale: "Le feedback redemande un réglage des alertes par rôle.",
      relatedThemeIds: [],
      backlogIssueId: null,
      backlogRelation: "aucun" as const,
      quotes: [{ feedbackId, text: quote }],
    },
  };
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
      [`group/${feedback.id}`]: attachToNotifications(feedback.id, "Il nous faut un résumé quotidien par rôle"),
      "assess/jeudi--notifications": ASSESS,
    });

    const logs: string[] = [];
    const { result, trace } = await ingestDirectFeedback({ store, feedback, provider, decisions, context, log: (line) => logs.push(line) });
    const tasks = provider.requests.map((request) => `${request.task}/${request.key}`);
    expect(tasks.filter((task) => task.startsWith("classify/"))).toEqual([`classify/${feedback.id}`]);
    const beforeConfidence = jeudi.state.rice.find((score) => score.themeKey === "notifications")!.confidence.value;
    const afterConfidence = result.state.rice.find((score) => score.themeKey === "notifications")!.confidence.value;
    expect(tasks.filter((task) => task.startsWith("assess/"))).toEqual(
      beforeConfidence === afterConfidence ? [] : ["assess/jeudi--notifications"],
    );
    expect(tasks.some((task) => task.startsWith("story/"))).toBe(false);
    const prompts = provider.requests.map((request) => request.prompt).join("\n");
    expect(prompts).not.toContain("Je prépare les métrés le soir dans la camionnette");
    expect(prompts).toContain("Thème notifications");
    expect(result.state.feedbacks.find((item) => item.id === feedback.id)?.author.name).toBe("Jean Marée");
    expect((await store.listFeedbacks()).find((row) => row.feedback.id === feedback.id)?.feedback.author.name).toBe("Jean Marée");
    expect(result.state.attachments?.find((item) => item.feedbackId === feedback.id)?.action).toBe("rattacher");
    expect(trace.steps.map((step) => step.name)).toEqual(["classification", "rattachement", "reevaluation", "ecriture"]);
    expect(trace.steps.every((step) => step.durationMs >= 0)).toBe(true);
    expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({ event: "feedback.ingest", feedbackId: feedback.id });
    expect(logs[0]).not.toMatch(/sk-or-|sb_publishable_|sb_secret_/);
    expect((await store.getRun("jeudi"))?.changes?.ingest?.feedbackId).toBe(feedback.id);

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
      [`group/${feedback.id}`]: {
        comparisons: [{ themeKey: "notifications", sameProblem: false, why: "La saisie hors ligne n'est pas le réglage des notifications." }],
        decision: {
          action: "creer",
          themeKey: "hors_ligne",
          title: "Saisie hors ligne",
          problem: "La saisie de l'avancement exige un réseau.",
          rationale: "Aucun thème ouvert ne parle de travailler sans réseau.",
          relatedThemeIds: [],
          backlogIssueId: null,
          backlogRelation: "aucun",
          quotes: [{ feedbackId: feedback.id, text: "cocher l'avancement hors ligne" }],
        },
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

  it("refuse un thème isolé quand le feedback est un bug du thème notifications", async () => {
    const store = await seeded();
    const feedback = buildDirectFeedback(
      {
        channel: "email",
        sourceAccountId: "acc-quai",
        authorName: "Inès Quai",
        language: "fr",
        text: "Depuis la dernière mise à jour, toutes les notifications de retard de tâche m'arrivent en double. Mon équipe ne les lit plus. Est-ce qu'on peut au moins choisir quelles alertes on reçoit selon le rôle ?",
      },
      new Date("2026-11-09T17:41:37.000Z"),
      "tu63k0",
    );
    const quote = "choisir quelles alertes on reçoit selon le rôle";
    const provider = scripted({
      [`classify/${feedback.id}`]: {
        type: "bug",
        severity: "majeure",
        injection: { suspected: false, excerpt: null },
        underlyingProblem: "Les notifications de retard arrivent en double, et le rôle ne peut pas choisir ses alertes.",
        actionable: true,
        quotes: [quote],
      },
      [`group/${feedback.id}`]: {
        comparisons: [
          {
            themeKey: "notifications",
            sameProblem: true,
            why: "Doublons de retard et choix des alertes par rôle : c'est le thème notifications.",
          },
        ],
        decision: {
          action: "creer",
          themeKey: "notifications_doublon",
          title: "Notifications de retard reçues en double depuis la dernière mise à jour",
          problem: "Les notifications de retard arrivent en double.",
          rationale: "Le modèle voudrait un thème neuf pour le doublon.",
          relatedThemeIds: [],
          backlogIssueId: null,
          backlogRelation: "aucun",
          quotes: [{ feedbackId: feedback.id, text: quote }],
        },
      },
      "assess/jeudi--notifications": ASSESS,
    });

    const { result } = await ingestDirectFeedback({ store, feedback, provider, decisions, context, log: () => undefined });
    expect(result.state.themes.map((theme) => theme.key)).not.toContain("notifications_doublon");
    expect(result.state.themes.find((theme) => theme.key === "notifications")?.feedbackIds).toContain(feedback.id);
    expect(result.state.attachments?.find((item) => item.feedbackId === feedback.id)).toMatchObject({
      action: "rattacher",
      themeKey: "notifications",
      forced: true,
    });
    expect(result.state.feedbacks.find((item) => item.id === feedback.id)?.author.name).toBe("Inès Quai");
    const move = result.changes?.ingest?.themes.find((theme) => theme.key === "notifications");
    expect(move?.created).toBe(false);
    expect(move?.rationale).toContain("notifications");
    expect(move?.riceBefore).not.toBeNull();
    expect(move?.moscowAfter).toBeTruthy();
  });

  it("un rattachement à notifications ne change pas le RICE des autres thèmes", async () => {
    const store = await seeded();
    const feedback = buildDirectFeedback(
      {
        channel: "email",
        sourceAccountId: "acc-quai",
        authorName: "Nadia",
        language: "fr",
        text: "Depuis la dernière mise à jour, toutes les notifications de retard de tâche m'arrivent en double. Mon équipe ne les lit plus. Est-ce qu'on peut au moins choisir quelles alertes on reçoit selon le rôle ?",
      },
      new Date("2026-11-09T18:11:22.000Z"),
      "1ehbym",
    );
    const { plan } = jevEngine("notifications", 1, false, { notifications: 1, epingle_photo: 0.04, aucun: 0.01 });
    const provider = scripted({});
    const { result } = await ingestDirectFeedback({ store, feedback, provider, decisions, context, decider: plan, log: () => undefined });

    expect(result.state.referenceDate).toBe(jeudi.state.referenceDate);
    expect(provider.requests).toEqual([]);
    for (const theme of jeudi.state.themes) {
      if (theme.key === "notifications") continue;
      expect(result.state.themes.find((item) => item.key === theme.key)).toEqual(theme);
    }
    for (const score of jeudi.state.rice) {
      if (score.themeKey === "notifications") continue;
      expect(result.state.rice.find((item) => item.themeKey === score.themeKey)).toEqual(score);
    }
    for (const decision of jeudi.state.allocation.decisions) {
      if (decision.themeKey === "notifications") continue;
      expect(result.state.allocation.decisions.find((item) => item.themeKey === decision.themeKey)).toEqual(decision);
    }
    expect(result.changes?.ingest?.themes.map((theme) => theme.key)).not.toContain("epingle_photo");
    const rationale = result.state.attachments?.find((item) => item.feedbackId === feedback.id)?.rationale ?? "";
    expect(rationale).toContain("Rattaché par Jev (confiance 1,00)");
    expect(rationale).toContain("Régler la fréquence des notifications selon le rôle");
    expect(rationale).toContain("2e choix : Montrer l'endroit d'une réserve sur la photo, 0,04");
    expect(rationale).not.toContain("typesafe");
  });

  it("rattache par Jev sans appel de regroupement quand la confiance suffit", async () => {
    const store = await seeded();
    const feedback = buildDirectFeedback(
      {
        channel: "email",
        sourceAccountId: "acc-quai",
        authorName: "Inès Quai",
        language: "fr",
        text: "Depuis la dernière mise à jour, toutes les notifications de retard de tâche m'arrivent en double. Mon équipe ne les lit plus. Est-ce qu'on peut au moins choisir quelles alertes on reçoit selon le rôle ?",
      },
      new Date("2026-11-09T17:41:37.000Z"),
      "jevok",
    );
    const { plan, calls } = jevEngine("notifications", 0.87);
    const provider = scripted({});
    const { result, trace } = await ingestDirectFeedback({
      store,
      feedback,
      provider,
      decisions,
      context,
      decider: plan,
      log: () => undefined,
    });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!.questions).sort()).toEqual(["critical", "injection", "theme", "type"]);
    expect(provider.requests.map((request) => request.task)).toEqual([]);
    expect(result.state.themes.map((theme) => theme.key)).not.toContain("notifications_doublon");
    expect(result.state.themes.find((theme) => theme.key === "notifications")?.feedbackIds).toContain(feedback.id);
    expect(trace.decision).toMatchObject({ choice: "notifications", confidence: 0.87, attached: true, fallbackUsed: false });
    expect(trace.steps.some((step) => step.name === "decision" && step.durationMs >= 0)).toBe(true);
    expect(trace.steps.find((step) => step.name === "rattachement")?.durationMs).toBe(0);
  });

  it("appelle Sonnet pour grouper si Jev ne reconnaît aucun thème", async () => {
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
      "aucun",
    );
    const { plan } = jevEngine("aucun", 0.93);
    const provider = scripted({
      [`group/${feedback.id}`]: {
        comparisons: [{ themeKey: "notifications", sameProblem: false, why: "Ce n'est pas le réglage des notifications." }],
        decision: {
          action: "creer",
          themeKey: "hors_ligne",
          title: "Saisie hors ligne",
          problem: "La saisie exige un réseau.",
          rationale: "Aucun thème ouvert ne parle de travailler sans réseau.",
          relatedThemeIds: [],
          backlogIssueId: null,
          backlogRelation: "aucun",
          quotes: [{ feedbackId: feedback.id, text: "cocher l'avancement hors ligne" }],
        },
      },
      "assess/jeudi--hors_ligne": ASSESS,
    });
    const { result } = await ingestDirectFeedback({ store, feedback, provider, decisions, context, decider: plan, log: () => undefined });
    expect(provider.requests.map((request) => request.task)).toEqual(["group", "assess"]);
    expect(result.state.themes.map((theme) => theme.key)).toContain("hors_ligne");
    expect(result.changes?.ingest?.decision).toMatchObject({ choice: "aucun", attached: false });
  });

  it("regroupe avec Sonnet si Jev reconnaît un thème sans assez de confiance", async () => {
    const store = await seeded();
    const feedback = buildDirectFeedback(
      {
        channel: "email",
        sourceAccountId: "acc-maree",
        authorName: "Jean Marée",
        language: "fr",
        text: "Les notifications partent encore à tout le monde. Il nous faut un résumé quotidien par rôle.",
      },
      new Date("2026-11-06T18:10:00+01:00"),
      "faible",
    );
    const { plan } = jevEngine("notifications", 0.4);
    const provider = scripted({
      [`group/${feedback.id}`]: attachToNotifications(feedback.id, "Il nous faut un résumé quotidien par rôle"),
      "assess/jeudi--notifications": ASSESS,
    });
    const { trace } = await ingestDirectFeedback({ store, feedback, provider, decisions, context, decider: plan, log: () => undefined });
    expect(provider.requests.map((request) => request.task)).toContain("group");
    expect(trace.decision).toMatchObject({ choice: "notifications", confidence: 0.4, attached: false });
  });

  it("compte le repli et regroupe avec Sonnet si Jev échoue", async () => {
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
      "repli",
    );
    const { plan, fallbacks } = jevEngine("notifications", 0.9, true);
    const provider = scripted({
      [`group/${feedback.id}`]: attachToNotifications(feedback.id, "Il nous faut un résumé quotidien par rôle"),
      "assess/jeudi--notifications": ASSESS,
    });
    const { trace } = await ingestDirectFeedback({ store, feedback, provider, decisions, context, decider: plan, log: () => undefined });
    expect(fallbacks.n).toBe(1);
    expect(provider.requests.map((request) => request.task)).toContain("group");
    expect(provider.requests.some((request) => request.task === "classify")).toBe(false);
    expect(trace.decision?.fallbackUsed).toBe(true);
    expect(trace.decision?.attached).toBe(false);
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
      [`group/${feedback.id}`]: attachToNotifications(feedback.id, "Il nous faut un résumé quotidien par rôle"),
      "assess/jeudi--notifications": ASSESS,
    });
    await expect(ingestDirectFeedback({ store, feedback, provider, decisions, context })).rejects.toBeInstanceOf(StoreError);
    expect(store.hasFeedback(feedback.id)).toBe(false);
  });
});
