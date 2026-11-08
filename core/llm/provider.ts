import type { z } from "zod";

export const LLM_TASKS = ["classify", "group", "assess", "story", "investigate"] as const;
export type LlmTask = (typeof LLM_TASKS)[number];

/**
 * Un appel borné : une tâche, une clé stable, un schéma de sortie.
 * Aucun outil n'est jamais transmis au modèle.
 */
export interface LlmRequest<S extends z.ZodType> {
  task: LlmTask;
  key: string;
  system: string;
  prompt: string;
  schema: S;
  /** Empreinte des seules données d'entrée : une réponse rejouée n'est valable que pour elles. */
  inputHash: string;
}

export interface LlmProvider {
  readonly name: string;
  generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>>;
}

export class LlmOutputError extends Error {
  constructor(task: LlmTask, key: string, detail: string) {
    super(`Sortie LLM invalide (${task} / ${key}) : ${detail}`);
  }
}

export function parseOutput<S extends z.ZodType>(request: LlmRequest<S>, value: unknown): z.infer<S> {
  const parsed = request.schema.safeParse(value);
  if (!parsed.success) throw new LlmOutputError(request.task, request.key, parsed.error.message);
  return parsed.data;
}
