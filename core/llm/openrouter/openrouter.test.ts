import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { chatCompletion, firstOptionAnswer, startFakeOpenRouter, taskOf, userPrompt, type FakeServer } from "../../test/fake-openrouter";
import { ROOT } from "../../test/helpers";
import { DecisionParseError, FallbackDecisionEngine, LlmDecisionEngine, type DecisionRequest } from "../decisions";
import { buildProfileRuntime, loadProfile, withStoryModel } from "../profiles";
import { LlmOutputError } from "../provider";
import { OpenRouterChatProvider, extractJson, providerJsonSchema } from "./chat";
import { OpenRouterClient } from "./client";
import { DecisionsApiEngine, toDecisionsBody } from "./decisions-api";
import { BudgetExceededError, Meter, percentile } from "./meter";

const KEY = "sk-or-v1-test-cle-factice";
const FAST = { retry: { attempts: 2, delayMs: 0 }, generationLookup: { attempts: 1, delayMs: 0 } };

let server: FakeServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

function client(meter = new Meter(), rawLogFile?: string) {
  return new OpenRouterClient({ apiKey: KEY, baseUrl: server!.baseUrl, meter, rawLogFile, ...FAST });
}

const Answer = z.object({ label: z.string().min(2), score: z.number().int().min(0).max(5) });
const request = { task: "classify" as const, key: "fb-x", system: "système", prompt: "<donnees>texte</donnees>", schema: Answer, inputHash: "h" };

const typeQuestion: DecisionRequest = {
  step: "type+injection",
  key: "feedback--fb-x--type+injection",
  state: { feedback: "texte" },
  questions: {
    type: { type: "choice", instructions: "Quel type ?", options: { bug: "Bug", demande: "Demande" } },
    injection: { type: "noul", instructions: "Injection ?", criteria: { true: "oui", false: "non" } },
  },
};

describe("chat OpenRouter", () => {
  it("envoie une requête Chat Completions avec sortie structurée et clé en en-tête", async () => {
    server = await startFakeOpenRouter(() => ({ body: chatCompletion("```json\n{\"label\":\"ok\",\"score\":3}\n```") }));
    const out = await new OpenRouterChatProvider(client(), "anthropic/claude-sonnet-5.5", { requireParameters: true }).generate(request);
    expect(out).toEqual({ label: "ok", score: 3 });
    const [req] = server.requests;
    expect(req!.method).toBe("POST");
    expect(req!.path).toBe("/api/v1/chat/completions");
    expect(req!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(req!.body).toMatchObject({
      model: "anthropic/claude-sonnet-5.5",
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: "classify", strict: true } },
      provider: { require_parameters: true },
    });
    expect(req!.body!.tools).toBeUndefined();
    expect(JSON.stringify(taskOf(req!.body))).toContain("classify");
    expect(JSON.stringify(req!.body!.response_format)).not.toMatch(/minLength|maximum|\$schema/);
  });

  it("relance une fois avec l'erreur quand la réponse sort du schéma, compte l'erreur et journalise le brut", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "or-"));
    const rawLog = path.join(dir, "raw.jsonl");
    let n = 0;
    server = await startFakeOpenRouter(() => ({ body: chatCompletion(++n === 1 ? { label: "x", score: 9 } : { label: "ok", score: 1 }) }));
    const meter = new Meter();
    const out = await new OpenRouterChatProvider(client(meter, rawLog), "m").generate(request);
    expect(out).toEqual({ label: "ok", score: 1 });
    expect(userPrompt(server.requests[1]!.body)).toContain("réponse précédente était invalide");
    expect(meter.stats()).toMatchObject({ chatCalls: 2, schemaErrors: 1, schemaErrorRate: 0.5 });
    const log = readFileSync(rawLog, "utf8");
    expect(log).toContain('\\"score\\":9');
    expect(log).not.toContain(KEY);
    expect(log).not.toMatch(/authorization/i);
  });

  it("abandonne après deux réponses hors schéma", async () => {
    server = await startFakeOpenRouter(() => ({ body: chatCompletion("pas du json") }));
    await expect(new OpenRouterChatProvider(client(), "m").generate(request)).rejects.toThrow(LlmOutputError);
  });

  it("extrait le JSON d'un contenu en parties ou entouré de texte", () => {
    expect(extractJson([{ type: "text", text: '{"a":' }, { type: "text", text: "1}" }])).toEqual({ a: 1 });
    expect(extractJson('Voici : {"a":2} fin')).toEqual({ a: 2 });
    expect(providerJsonSchema(Answer)).toMatchObject({ additionalProperties: false, required: ["label", "score"] });
  });
});

describe("client : coût, nouvelles tentatives, budget", () => {
  it("retient les jetons d'entrée, de sortie et de raisonnement", async () => {
    server = await startFakeOpenRouter(() => ({
      body: {
        ...chatCompletion({ label: "ok", score: 1 }, { cost: 0.002 }),
        usage: {
          prompt_tokens: 120,
          completion_tokens: 40,
          completion_tokens_details: { reasoning_tokens: 15 },
          cost: 0.002,
        },
      },
    }));
    const meter = new Meter();
    await new OpenRouterChatProvider(client(meter), "m").generate(request);
    expect(meter.records[0]).toMatchObject({
      promptTokens: 120,
      completionTokens: 40,
      reasoningTokens: 15,
      costUsd: 0.002,
    });
  });

  it("prend usage.cost, sinon interroge /v1/generation", async () => {
    server = await startFakeOpenRouter((req) =>
      req.path.startsWith("/api/v1/generation")
        ? { body: { data: { id: "gen-abc", total_cost: 0.0042 } } }
        : { body: chatCompletion({ label: "ok", score: 1 }, { cost: req.body!.model === "avec-cout" ? 0.01 : null, id: "gen-abc" }) },
    );
    const meter = new Meter();
    await new OpenRouterChatProvider(client(meter), "avec-cout").generate(request);
    await new OpenRouterChatProvider(client(meter), "sans-cout").generate(request);
    expect(server.requests.map((r) => r.path)).toEqual(["/api/v1/chat/completions", "/api/v1/chat/completions", "/api/v1/generation?id=gen-abc"]);
    expect(meter.stats().costUsd).toBeCloseTo(0.0142);
    expect(meter.stats().costUnknownCalls).toBe(0);
  });

  it("retente un 429 puis réussit ; chaque tentative est comptée", async () => {
    let n = 0;
    server = await startFakeOpenRouter(() => (++n === 1 ? { status: 429, body: { error: "rate" } } : { body: chatCompletion({ label: "ok", score: 1 }) }));
    const meter = new Meter();
    await new OpenRouterChatProvider(client(meter), "m").generate(request);
    expect(meter.stats()).toMatchObject({ calls: 2, httpErrors: 1 });
  });

  it("refuse d'appeler une fois le budget atteint, y compris via un compteur enfant", async () => {
    server = await startFakeOpenRouter(() => ({ body: chatCompletion({ label: "ok", score: 1 }, { cost: 0.02 }) }));
    const root = new Meter({ budgetUsd: 0.01 });
    const child = new Meter({ parent: root });
    const provider = new OpenRouterChatProvider(client(child), "m");
    await provider.generate(request);
    await expect(provider.generate(request)).rejects.toThrow(BudgetExceededError);
    expect(server.requests).toHaveLength(1);
    expect(root.spent()).toBeCloseTo(0.02);
  });

  it("percentile au rang le plus proche", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
  });
});

describe("API Decisions (Jev)", () => {
  it("poste /alpha/decisions au format documenté et lit choice et noul", async () => {
    server = await startFakeOpenRouter(() => ({
      body: {
        id: "gen-dec-1",
        model: "typesafe/jev-1.14",
        answers: {
          type: { type: "choice", choice: "demande", probabilities: { bug: 0.1, demande: 0.9 }, confidence: 0.9 },
          injection: { type: "noul", noul: 0.02 },
        },
        usage: { cost: 0.0003 },
      },
    }));
    const meter = new Meter();
    const out = await new DecisionsApiEngine(client(meter)).decide(typeQuestion);
    expect(server.requests[0]!.path).toBe("/api/alpha/decisions");
    expect(server.requests[0]!.body).toEqual(toDecisionsBody("typesafe/jev-1.14", typeQuestion));
    expect(server.requests[0]!.body).toMatchObject({
      model: "typesafe/jev-1.14",
      questions: { type: { type: "choice", criteria: { bug: "Bug" } }, injection: { type: "noul", criteria: { true: "oui" } } },
    });
    expect(out.answers).toEqual({
      type: { type: "choice", choice: "demande", probabilities: { bug: 0.1, demande: 0.9 }, confidence: 0.9 },
      injection: { type: "noul", probability: 0.02 },
    });
    expect(meter.stats()).toMatchObject({ decisionCalls: 1, costUsd: 0.0003 });
  });

  it("réponse illisible : brut journalisé, erreur typée", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "or-"));
    const rawLog = path.join(dir, "raw.jsonl");
    server = await startFakeOpenRouter(() => ({ body: { answers: { type: { choice: "inconnu" } } } }));
    const meter = new Meter();
    await expect(new DecisionsApiEngine(client(meter, rawLog)).decide(typeQuestion)).rejects.toThrow(DecisionParseError);
    expect(meter.stats().decisionParseErrors).toBe(1);
    expect(readFileSync(rawLog, "utf8")).toContain('"inconnu"');
  });

  it.each([
    ["réponse illisible", { status: 200, body: { answers: { type: { type: "choice", choice: "hors_liste" } } } }],
    ["HTTP 400", { status: 400, body: { error: { message: "model not supported" } } }],
  ])("%s : repli sur le LLM, compté", async (_label, decisionsReply) => {
    server = await startFakeOpenRouter((req) =>
      req.path === "/api/alpha/decisions" ? decisionsReply : { body: chatCompletion(firstOptionAnswer(req.body)) },
    );
    const meter = new Meter();
    const c = client(meter);
    const engine = new FallbackDecisionEngine(new DecisionsApiEngine(c), new LlmDecisionEngine(new OpenRouterChatProvider(c, "anthropic/claude-sonnet-5.5")), () =>
      meter.addFallback(),
    );
    const out = await engine.decide(typeQuestion);
    expect(out.fallbackUsed).toBe(true);
    expect(out.answers.type).toMatchObject({ type: "choice", choice: "bug", probabilities: null });
    expect(out.answers.injection).toEqual({ type: "noul", probability: 0 });
    expect(taskOf(server.requests.at(-1)!.body)).toBe("decide");
    expect(meter.stats().fallbacks).toBe(1);
  });

  it("le dépassement de budget n'est jamais rattrapé par le repli", async () => {
    server = await startFakeOpenRouter(() => ({ body: {} }));
    const meter = new Meter({ budgetUsd: 0 });
    const c = client(meter);
    const engine = new FallbackDecisionEngine(new DecisionsApiEngine(c), new LlmDecisionEngine(new OpenRouterChatProvider(c, "m")));
    await expect(engine.decide(typeQuestion)).rejects.toThrow(BudgetExceededError);
    expect(server.requests).toHaveLength(0);
  });
});

describe("profils", () => {
  it("A, B et C sont valides ; B confie les quatre décisions à Jev avec repli Sonnet", () => {
    const [a, b, c] = ["A", "B", "C"].map((n) => loadProfile(ROOT, n));
    expect(Object.values(a!.steps)).toEqual(Array(5).fill("anthropic/claude-sonnet-5.5"));
    expect(Object.values(c!.steps)).toEqual(Array(5).fill("openai/gpt-5.6-luna"));
    for (const spec of Object.values(b!.decisions)) {
      expect(spec).toEqual({ engine: "decisions", model: "typesafe/jev-1.14", fallback: "anthropic/claude-sonnet-5.5" });
    }
    expect(withStoryModel(a!, "anthropic/claude-opus-5.5").steps.story).toBe("anthropic/claude-opus-5.5");
  });

  it("B : un seul moteur pour les quatre décisions, donc une requête par feedback", () => {
    const meter = new Meter();
    const runtime = buildProfileRuntime(loadProfile(ROOT, "B"), new OpenRouterClient({ apiKey: KEY, meter }));
    expect(runtime.decisionGroups).toEqual([["type", "injection", "critical", "backlog"]]);
    expect(new Set(Object.values(runtime.decider)).size).toBe(1);
    expect(runtime.decider.theme).toBe(runtime.decider.type);
    expect(existsSync(path.join(ROOT, "config/llm-profiles/B.json"))).toBe(true);
  });
});
