import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { LLM_TASKS, parseOutput, type LlmProvider, type LlmRequest, type LlmTask } from "./provider";

export const FIXTURE_ORIGINS = ["redigee", "enregistree"] as const;

export const FixtureSchema = z.object({
  task: z.enum(LLM_TASKS),
  key: z.string(),
  inputHash: z.string(),
  /** « redigee » : écrite à la main. « enregistree » : sortie réelle d'un modèle. */
  origin: z.enum(FIXTURE_ORIGINS),
  model: z.string().nullable(),
  response: z.unknown(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export function fixturePath(dir: string, task: LlmTask, key: string): string {
  return path.join(dir, task, `${key}.json`);
}

export class MissingFixtureError extends Error {}
export class StaleFixtureError extends Error {}

/** Rejoue des réponses enregistrées. Aucun réseau, aucune clé. */
export class ReplayProvider implements LlmProvider {
  readonly name = "replay";
  readonly staleKeys: string[] = [];
  readonly origins = new Map<string, Fixture["origin"]>();

  constructor(
    private readonly dir: string,
    private readonly options: { allowStale?: boolean } = {},
  ) {}

  async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    const file = fixturePath(this.dir, request.task, request.key);
    if (!existsSync(file)) {
      throw new MissingFixtureError(
        `Aucune réponse enregistrée pour ${request.task} / ${request.key} (${path.relative(process.cwd(), file)}). ` +
          "Lancer avec --provider real --record pour l'enregistrer.",
      );
    }
    const fixture = FixtureSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    if (fixture.inputHash !== request.inputHash) {
      if (!this.options.allowStale) {
        throw new StaleFixtureError(
          `Réponse enregistrée obsolète pour ${request.task} / ${request.key} : les données d'entrée ont changé. ` +
            "Réenregistrer, ou relancer avec --allow-stale-fixtures en connaissance de cause.",
        );
      }
      this.staleKeys.push(`${request.task}/${request.key}`);
    }
    this.origins.set(`${request.task}/${request.key}`, fixture.origin);
    return parseOutput(request, fixture.response);
  }
}

/** Enveloppe un fournisseur et écrit chaque réponse validée comme fixture. */
export class RecordingProvider implements LlmProvider {
  readonly name: string;

  constructor(
    private readonly inner: LlmProvider,
    private readonly dir: string,
    private readonly origin: Fixture["origin"],
    private readonly model: string | null,
  ) {
    this.name = `${inner.name}+enregistrement`;
  }

  async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    const response = await this.inner.generate(request);
    const file = fixturePath(this.dir, request.task, request.key);
    mkdirSync(path.dirname(file), { recursive: true });
    const fixture: Fixture = {
      task: request.task,
      key: request.key,
      inputHash: request.inputHash,
      origin: this.origin,
      model: this.model,
      response,
    };
    writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
    return response;
  }
}
