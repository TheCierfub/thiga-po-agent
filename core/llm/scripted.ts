import type { z } from "zod";
import { parseOutput, type LlmProvider, type LlmRequest } from "./provider";

/** Réponses fournies d'avance, par tâche et par clé. Sert aux tests et à la rédaction des fixtures. */
export class ScriptedProvider implements LlmProvider {
  readonly name = "scripted";
  readonly requests: LlmRequest<z.ZodType>[] = [];

  constructor(private readonly responses: Record<string, unknown>) {}

  async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    this.requests.push(request);
    const id = `${request.task}/${request.key}`;
    if (!(id in this.responses)) throw new Error(`Pas de réponse scriptée pour ${id}`);
    return parseOutput(request, this.responses[id]);
  }
}
