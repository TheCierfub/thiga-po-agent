import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { replayRuntime } from "../llm/runtime";
import { chatCompletion, firstOptionAnswer, fixtureAnswersByPrompt, startFakeOpenRouter, taskOf, userPrompt, type FakeRequest, type FakeServer } from "../test/fake-openrouter";
import { ROOT } from "../test/helpers";
import { assertNoSecrets, runCompare, type ProfileResult } from "./compare";
import { runEvaluation } from "./run-eval";

const KEY = "sk-or-v1-cle-factice-de-test";
const FAST = { retry: { attempts: 1, delayMs: 0 }, generationLookup: { attempts: 1, delayMs: 0 } };

/** Copie de travail : l'enregistrement de fixtures ne touche jamais le dépôt. */
function sandbox(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "etai-compare-"));
  for (const sub of ["data", "config", "fixtures"]) cpSync(path.join(ROOT, sub), path.join(dir, sub), { recursive: true });
  return dir;
}

const HOLDOUT_CLASSIFICATION = {
  type: "eloge",
  severity: null,
  injection: { suspected: false, excerpt: null },
  underlyingProblem: "Retour sans demande.",
  actionable: true,
  quotes: [],
};

let answers: Map<string, unknown>;
let referenceA: ProfileResult | null = null;
let server: FakeServer;
let decisionsBehaviour: (req: FakeRequest) => { status?: number; body: unknown } = () => ({ status: 500, body: {} });

beforeAll(async () => {
  answers = await fixtureAnswersByPrompt(ROOT);
  server = await startFakeOpenRouter((req) => {
    if (req.path === "/api/alpha/decisions") return decisionsBehaviour(req);
    const task = taskOf(req.body);
    const known = answers.get(userPrompt(req.body));
    if (known !== undefined) return { body: chatCompletion(known, { cost: 0.001 }) };
    if (task === "decide") return { body: chatCompletion(backlogOracle(userPrompt(req.body)) ?? firstOptionAnswer(req.body), { cost: 0.0005 }) };
    if (task === "classify") return { body: chatCompletion(HOLDOUT_CLASSIFICATION, { cost: 0.001 }) };
    return { status: 400, body: { error: { message: `prompt inconnu pour ${task}` } } };
  });
});
afterAll(() => server.close());

type Classified = { type: string; severity: string | null; injection: { suspected: boolean }; actionable: boolean };
type Grouped = { themes: { title: string; backlogIssueId: string | null; backlogRelation: string }[] };

/** Ce qu'aurait répondu un modèle de décision d'accord avec les fixtures. */
function classificationOf(text: string): Classified | null {
  for (const [prompt, out] of answers) {
    if (out && typeof out === "object" && "actionable" in out && prompt.includes(text)) return out as Classified;
  }
  return null;
}

function backlogOracle(prompt: string) {
  for (const out of answers.values()) {
    for (const t of (out as Partial<Grouped>).themes ?? []) {
      if (prompt.includes(JSON.stringify(t.title))) {
        return { issue: { choice: t.backlogIssueId ?? "aucune" }, relation: { choice: t.backlogRelation === "doublon" ? "doublon" : "lie" } };
      }
    }
  }
  return null;
}

const metric = (r: ProfileResult, name: string, section?: string) =>
  r.metrics.find((m) => m.name === name && (!section || m.section === section))?.value;

describe("pnpm eval:compare contre un faux OpenRouter", () => {
  it("profil A : mêmes métriques qu'en rejeu, coûts et latences mesurés, récapitulatif écrit", async () => {
    const root = sandbox();
    const outDir = path.join(root, "out/eval-real");
    const [a] = await runCompare({ root, profiles: ["A"], budgetUsd: 5, storyModel: null, recordFixtures: null, outDir, apiKey: KEY, baseUrl: server.baseUrl, ...FAST });
    expect(a!.status).toBe("termine");
    referenceA = a!;

    const replayed = await runEvaluation({ root: ROOT, runtime: { provider: replayRuntime(ROOT).replay, decider: {} }, withHoldout: false });
    for (const m of replayed.report.metrics.filter((x) => x.section !== "Holdout (10 feedbacks, jamais utilisés pour les fixtures)" && x.section !== "Données personnelles")) {
      expect(metric(a!, m.name, m.section), `${m.section} · ${m.name}`).toEqual(m.value);
    }
    expect(a!.stats).toMatchObject({ httpErrors: 0, schemaErrors: 0, decisionCalls: 0, costUnknownCalls: 0 });
    expect(a!.stats!.chatCalls).toBeGreaterThan(60);
    expect(a!.stats!.costUsd).toBeCloseTo(a!.stats!.chatCalls * 0.001);
    expect(a!.stats!.latencyP95Ms).toBeGreaterThan(0);
    expect(a!.stats!.latencyMeanMs).toBeGreaterThan(0);

    const holdoutTypes = a!.metrics.find((m) => m.section.startsWith("Holdout") && m.name.startsWith("types"));
    expect(holdoutTypes?.value).not.toBe("non évalué");
    expect(a!.discrepancies.some((d) => d.feedbackId.startsWith("fb-hold") && d.field === "type")).toBe(true);
    expect(a!.discrepancies.filter((d) => !d.feedbackId.startsWith("fb-hold"))).toEqual([
      { feedbackId: "fb-lundi-26", field: "thème", expected: "nom_fichier_export", got: "aucun" },
    ]);

    const summary = readFileSync(path.join(outDir, "summary.md"), "utf8");
    expect(summary).toContain("| latence p95 |");
    expect(summary).toContain("## Écarts avec la clé, par feedback");
    expect(JSON.parse(readFileSync(path.join(outDir, "A.json"), "utf8")).status).toBe("termine");
    const sent = server.requests.filter((r) => r.path === "/api/v1/chat/completions");
    expect(sent.every((r) => r.headers.authorization === `Bearer ${KEY}` && r.body!.model === "anthropic/claude-sonnet-5.5")).toBe(true);
  });

  it("profil B : décisions par l'API Decisions, repli LLM sur réponse illisible, brut journalisé", async () => {
    const root = sandbox();
    const outDir = path.join(root, "out/eval-real");
    decisionsBehaviour = (req) => {
      const questions = req.body!.questions as Record<string, { type: string; criteria: Record<string, string> }>;
      if ("issue" in questions) return { body: { answers: { issue: { type: "choice", choice: "LIN-inexistante" } } } };
      const c = classificationOf((req.body!.state as { feedback: string }).feedback);
      return {
        body: {
          id: "gen-dec-x",
          answers: {
            type: { type: "choice", choice: c?.type ?? "eloge", probabilities: { [c?.type ?? "eloge"]: 0.8 }, confidence: 0.8 },
            injection: { type: "noul", noul: c?.injection.suspected ? 0.9 : 0.02 },
            critical: { type: "choice", choice: c?.severity ?? "pas_un_bug" },
          },
          usage: { cost: 0.0001 },
        },
      };
    };
    const before = server.requests.length;
    const [b] = await runCompare({ root, profiles: ["B"], budgetUsd: 5, storyModel: "anthropic/claude-opus-5.5", recordFixtures: null, outDir, apiKey: KEY, baseUrl: server.baseUrl, ...FAST });
    expect(b!.error).toBeNull();
    expect(b!.status).toBe("termine");
    expect(b!.stats!.decisionCalls).toBeGreaterThan(50);
    expect(b!.stats!.decisionParseErrors).toBeGreaterThan(0);
    expect(b!.stats!.fallbacks).toBe(b!.stats!.decisionParseErrors);
    for (const name of ["thème rattaché à la bonne issue du backlog", "classe MoSCoW par thème", "types", "injections (rappel)", "Must attendus présents"]) {
      const sections = b!.metrics.filter((m) => m.name === name).map((m) => m.section);
      for (const section of sections) expect(metric(b!, name, section), `${section} · ${name}`).toEqual(metric(referenceA!, name, section));
    }
    const mine = server.requests.slice(before);
    const decisionBody = mine.find((r) => r.path === "/api/alpha/decisions")!.body!;
    expect(decisionBody.model).toBe("typesafe/jev-1.14");
    expect(Object.keys(decisionBody.questions as object)).toEqual(["type", "injection", "critical"]);
    expect(mine.some((r) => taskOf(r.body) === "story" && r.body!.model === "anthropic/claude-opus-5.5")).toBe(true);
    expect(readFileSync(path.join(outDir, "raw-responses.jsonl"), "utf8")).toContain("LIN-inexistante");
    expect(readFileSync(path.join(outDir, "raw-responses.jsonl"), "utf8")).not.toContain(KEY);
  });

  it("s'arrête proprement au plafond de budget et écrit quand même le récapitulatif", async () => {
    const root = sandbox();
    const outDir = path.join(root, "out/eval-real");
    const results = await runCompare({ root, profiles: ["A", "B", "C"], budgetUsd: 0.01, storyModel: null, recordFixtures: null, outDir, apiKey: KEY, baseUrl: server.baseUrl, ...FAST });
    expect(results.map((r) => r.status)).toEqual(["budget_atteint", "non_lance", "non_lance"]);
    expect(results[0]!.stats!.costUsd).toBeLessThan(0.01 + 4 * 0.001 + 1e-9);
    const summary = readFileSync(path.join(outDir, "summary.md"), "utf8");
    expect(summary).toContain("arrêté : budget atteint");
    expect(summary).toContain("non lancé");
    expect(existsSync(path.join(outDir, "C.json"))).toBe(true);
  });

  it("--record-fixtures : remplace les fixtures par les sorties réelles, sans secret, et le rejeu les relit", async () => {
    const root = sandbox();
    const outDir = path.join(root, "out/eval-real");
    const [a] = await runCompare({ root, profiles: ["A"], budgetUsd: 5, storyModel: null, recordFixtures: "A", outDir, apiKey: KEY, baseUrl: server.baseUrl, ...FAST });
    expect(a!.fixturesRecorded).toBe(true);
    const dir = path.join(root, "fixtures/llm");
    const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ profile: "A", origin: "enregistree", decisionGroups: [] });
    expect(() => assertNoSecrets(dir, KEY)).not.toThrow();
    const files = readdirSync(path.join(dir, "classify"));
    expect(files.some((f) => f.startsWith("fb-hold"))).toBe(false);
    const sample = JSON.parse(readFileSync(path.join(dir, "classify", files[0]!), "utf8"));
    expect(sample).toMatchObject({ origin: "enregistree", model: "anthropic/claude-sonnet-5.5" });

    const { replay, decider } = replayRuntime(root);
    const rerun = await runEvaluation({ root, runtime: { provider: replay, decider }, withHoldout: false });
    expect(rerun.report.metrics.find((m) => m.name.startsWith("thèmes retrouvés"))?.value).toEqual(
      metric(a!, "thèmes retrouvés (Jaccard ≥ 0,5)", rerun.report.metrics.find((m) => m.name.startsWith("thèmes retrouvés"))!.section),
    );
    expect([...replay.origins.values()].every((o) => o === "enregistree")).toBe(true);
  });

  it("le garde-fou refuse des fixtures contenant la clé ou un en-tête d'autorisation", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "etai-secret-"));
    cpSync(path.join(ROOT, "fixtures/llm/group"), path.join(dir, "group"), { recursive: true });
    expect(() => assertNoSecrets(dir, KEY)).not.toThrow();
    cpSync(path.join(ROOT, "fixtures/llm/story"), path.join(dir, "story"), { recursive: true });
    writeFileSync(path.join(dir, "fuite.json"), `{"headers":{"Authorization":"Bearer ${KEY}"}}`);
    expect(() => assertNoSecrets(dir, KEY)).toThrow(/Secret/);
  });
});
