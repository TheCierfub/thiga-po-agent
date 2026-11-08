import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { hashOf } from "../util/hash";
import { MissingFixtureError, StaleFixtureError, type Fixture } from "./fixtures";
import { COMPANY_CONTEXT, DATA_BOUNDARY_RULES, frameData } from "./prompts";
import type { LlmProvider } from "./provider";

/**
 * Questions fermées, au format des modèles de décision (API Decisions d'OpenRouter) :
 * - choice : une option parmi un ensemble (2 à 255 options) ;
 * - noul : oui ou non, avec la probabilité du oui.
 */
export type DecisionQuestion =
  | { type: "choice"; instructions: string; options: Record<string, string> }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

export interface DecisionRequest {
  /** Étape(s) métier, pour le comptage des appels. */
  step: string;
  /** Clé stable de la question posée, pour le rejeu. */
  key: string;
  state: Record<string, unknown>;
  questions: Record<string, DecisionQuestion>;
}

export type DecisionAnswer =
  | { type: "choice"; choice: string; probabilities: Record<string, number> | null; confidence: number | null }
  | { type: "noul"; probability: number };

export interface DecisionResult {
  engine: string;
  answers: Record<string, DecisionAnswer>;
  fallbackUsed: boolean;
}

export interface DecisionEngine {
  readonly name: string;
  decide(request: DecisionRequest): Promise<DecisionResult>;
}

export class DecisionParseError extends Error {
  constructor(engine: string, key: string, detail: string) {
    super(`Réponse de décision illisible (${engine} / ${key}) : ${detail}`);
    this.name = "DecisionParseError";
  }
}

export function decisionInputHash(request: DecisionRequest): string {
  return hashOf({ state: request.state, questions: request.questions });
}

/** Vérifie qu'une réponse répond à chaque question, avec le bon type et une option connue. */
export function validateAnswers(engine: string, request: DecisionRequest, answers: Record<string, DecisionAnswer>): void {
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = answers[id];
    if (!answer) throw new DecisionParseError(engine, request.key, `pas de réponse pour « ${id} »`);
    if (answer.type !== question.type) {
      throw new DecisionParseError(engine, request.key, `« ${id} » : type ${answer.type} au lieu de ${question.type}`);
    }
    if (answer.type === "choice" && question.type === "choice" && !(answer.choice in question.options)) {
      throw new DecisionParseError(engine, request.key, `« ${id} » : option inconnue « ${answer.choice} »`);
    }
    if (answer.type === "noul" && !(answer.probability >= 0 && answer.probability <= 1)) {
      throw new DecisionParseError(engine, request.key, `« ${id} » : probabilité hors de [0, 1]`);
    }
  }
}

const DECIDE_SYSTEM = `${COMPANY_CONTEXT}

Tâche : répondre à des questions fermées sur des données. Pour chaque question, choisis exactement une des options proposées, ou réponds oui ou non.

${DATA_BOUNDARY_RULES}`;

function llmSchemaFor(request: DecisionRequest) {
  const shape: Record<string, z.ZodType> = {};
  for (const [id, q] of Object.entries(request.questions)) {
    shape[id] =
      q.type === "choice"
        ? z.object({ choice: z.enum(Object.keys(q.options) as [string, ...string[]]) })
        : z.object({ yes: z.boolean() });
  }
  return z.object(shape);
}

function renderQuestions(request: DecisionRequest): string {
  return Object.entries(request.questions)
    .map(([id, q]) => {
      if (q.type === "noul") {
        const criteria = q.criteria ? `\n  oui : ${q.criteria.true}\n  non : ${q.criteria.false}` : "";
        return `- ${id} (oui/non) : ${q.instructions}${criteria}`;
      }
      const options = Object.entries(q.options)
        .map(([k, v]) => `  - ${k} : ${v}`)
        .join("\n");
      return `- ${id} (une option) : ${q.instructions}\n${options}`;
    })
    .join("\n");
}

/** Pose les questions fermées à un LLM génératif. Pas de probabilités : il n'en donne pas de calibrées. */
export class LlmDecisionEngine implements DecisionEngine {
  readonly name: string;
  constructor(private readonly provider: LlmProvider) {
    this.name = `llm:${provider.name}`;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    const out = (await this.provider.generate({
      task: "decide",
      key: request.key,
      system: DECIDE_SYSTEM,
      prompt: [
        frameData({ role: "etat" }, JSON.stringify(request.state, null, 2)),
        `Questions :\n${renderQuestions(request)}`,
      ].join("\n\n"),
      schema: llmSchemaFor(request),
      inputHash: decisionInputHash(request),
    })) as Record<string, { choice?: string; yes?: boolean }>;
    const answers: Record<string, DecisionAnswer> = {};
    for (const [id, q] of Object.entries(request.questions)) {
      const a = out[id]!;
      answers[id] =
        q.type === "choice"
          ? { type: "choice", choice: a.choice!, probabilities: null, confidence: null }
          : { type: "noul", probability: a.yes ? 1 : 0 };
    }
    return { engine: this.name, answers, fallbackUsed: false };
  }
}

/** Erreurs qui doivent interrompre le passage au lieu de déclencher un repli. */
export function isFatal(error: unknown): boolean {
  return error instanceof Error && error.name === "BudgetExceededError";
}

/** Essaie le moteur principal ; en cas d'échec, journalise et se rabat sur le second. */
export class FallbackDecisionEngine implements DecisionEngine {
  readonly name: string;
  constructor(
    private readonly primary: DecisionEngine,
    private readonly fallback: DecisionEngine,
    private readonly onFallback: (request: DecisionRequest, error: unknown) => void = () => {},
  ) {
    this.name = `${primary.name}|repli:${fallback.name}`;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    try {
      return await this.primary.decide(request);
    } catch (error) {
      if (isFatal(error)) throw error;
      this.onFallback(request, error);
      const result = await this.fallback.decide(request);
      return { ...result, fallbackUsed: true };
    }
  }
}

const DecisionFixtureSchema = z.object({
  key: z.string(),
  inputHash: z.string(),
  origin: z.enum(["redigee", "enregistree"]),
  engine: z.string(),
  result: z.object({
    engine: z.string(),
    answers: z.record(z.string(), z.unknown()),
    fallbackUsed: z.boolean(),
  }),
});

function decisionFixturePath(dir: string, key: string): string {
  return path.join(dir, "decisions", `${key}.json`);
}

export class ReplayDecisionEngine implements DecisionEngine {
  readonly name = "replay";
  constructor(
    private readonly dir: string,
    private readonly options: { allowStale?: boolean; staleKeys?: string[] } = {},
  ) {}

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    const file = decisionFixturePath(this.dir, request.key);
    if (!existsSync(file)) throw new MissingFixtureError(`Aucune décision enregistrée pour ${request.key}.`);
    const fixture = DecisionFixtureSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    if (fixture.inputHash !== decisionInputHash(request)) {
      if (!this.options.allowStale) throw new StaleFixtureError(`Décision enregistrée obsolète pour ${request.key}.`);
      this.options.staleKeys?.push(`decisions/${request.key}`);
    }
    const result = fixture.result as DecisionResult;
    validateAnswers(this.name, request, result.answers);
    return result;
  }
}

export class RecordingDecisionEngine implements DecisionEngine {
  readonly name: string;
  constructor(
    private readonly inner: DecisionEngine,
    private readonly dir: string,
    private readonly origin: Fixture["origin"],
  ) {
    this.name = inner.name;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    const result = await this.inner.decide(request);
    const file = decisionFixturePath(this.dir, request.key);
    mkdirSync(path.dirname(file), { recursive: true });
    const fixture = {
      key: request.key,
      inputHash: decisionInputHash(request),
      origin: this.origin,
      engine: result.engine,
      result,
    };
    writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
    return result;
  }
}
