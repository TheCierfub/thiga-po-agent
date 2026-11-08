import { z } from "zod";
import {
  DecisionParseError,
  validateAnswers,
  type DecisionAnswer,
  type DecisionEngine,
  type DecisionRequest,
  type DecisionResult,
} from "../decisions";
import type { OpenRouterClient } from "./client";

/**
 * Format documenté par OpenRouter (API alpha, « the shape may change ») :
 * POST /api/alpha/decisions { model, state, questions: { id: { type, instructions, criteria } } }
 * → { id, model, provider, answers: { id: { type: "choice", choice, probabilities?, confidence? }
 *                                         | { type: "noul", noul } }, usage: { cost } }
 * Lecture défensive : tout écart est journalisé avec la réponse brute, puis signalé comme erreur.
 */
const ChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()).optional(),
  confidence: z.number().optional(),
});
const NoulAnswerSchema = z.object({ type: z.literal("noul"), noul: z.number() });
const AnswerSchema = z.discriminatedUnion("type", [ChoiceAnswerSchema, NoulAnswerSchema]);
const DecisionsResponseSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  model: z.string().optional(),
});

export const DEFAULT_DECISION_MODEL = "typesafe/jev-1.14";

export function toDecisionsBody(model: string, request: DecisionRequest) {
  return {
    model,
    state: request.state,
    questions: Object.fromEntries(
      Object.entries(request.questions).map(([id, q]) => [
        id,
        q.type === "choice"
          ? { type: "choice", instructions: q.instructions, criteria: q.options }
          : { type: "noul", instructions: q.instructions, ...(q.criteria ? { criteria: q.criteria } : {}) },
      ]),
    ),
  };
}

export class DecisionsApiEngine implements DecisionEngine {
  readonly name: string;

  constructor(
    private readonly client: OpenRouterClient,
    readonly model: string = DEFAULT_DECISION_MODEL,
  ) {
    this.name = `decisions:${model}`;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    for (const [id, q] of Object.entries(request.questions)) {
      const n = q.type === "choice" ? Object.keys(q.options).length : 2;
      if (n < 2 || n > 255) throw new DecisionParseError(this.name, request.key, `« ${id} » : ${n} options, hors de 2 à 255`);
    }
    const { json } = await this.client.post("/alpha/decisions", toDecisionsBody(this.model, request), {
      kind: "decision",
      step: request.step,
      model: this.model,
    });
    try {
      const body = DecisionsResponseSchema.parse(json);
      const answers: Record<string, DecisionAnswer> = {};
      for (const id of Object.keys(request.questions)) {
        const a = AnswerSchema.parse(body.answers[id]);
        answers[id] =
          a.type === "choice"
            ? { type: "choice", choice: a.choice, probabilities: a.probabilities ?? null, confidence: a.confidence ?? null }
            : { type: "noul", probability: a.noul };
      }
      validateAnswers(this.name, request, answers);
      return { engine: this.name, answers, fallbackUsed: false };
    } catch (error) {
      this.client.meter.addDecisionParseError();
      const detail = error instanceof Error ? error.message : String(error);
      this.client.logRaw({ step: request.step, key: request.key, model: this.model, error: detail, raw: json });
      throw error instanceof DecisionParseError ? error : new DecisionParseError(this.name, request.key, detail);
    }
  }
}
