import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { parseOutput, type LlmProvider, type LlmRequest } from "./provider";

export const REAL_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;
type RealProviderName = (typeof REAL_PROVIDERS)[number];

const KEY_VARIABLE: Record<RealProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export interface RealProviderConfig {
  provider: RealProviderName;
  model: string;
}

export function readRealProviderConfig(env: NodeJS.ProcessEnv = process.env): RealProviderConfig {
  const provider = env.LLM_PROVIDER as RealProviderName | undefined;
  if (!provider || !REAL_PROVIDERS.includes(provider)) {
    throw new Error(`LLM_PROVIDER doit valoir ${REAL_PROVIDERS.join(", ")} (voir .env.example).`);
  }
  const model = env.LLM_MODEL?.trim();
  if (!model) throw new Error("LLM_MODEL est vide (voir .env.example).");
  const keyVariable = KEY_VARIABLE[provider];
  if (!env[keyVariable]) throw new Error(`${keyVariable} est absente. Sans clé, utiliser --provider replay.`);
  return { provider, model };
}

function languageModel(config: RealProviderConfig, env: NodeJS.ProcessEnv): LanguageModel {
  switch (config.provider) {
    case "openai":
      return createOpenAI({ apiKey: env.OPENAI_API_KEY })(config.model);
    case "anthropic":
      return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(config.model);
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: env.OPENROUTER_API_KEY,
        supportsStructuredOutputs: true,
      })(config.model);
  }
}

/** Appel réel, sans outil : le modèle ne peut que renvoyer un objet conforme au schéma. */
export class RealProvider implements LlmProvider {
  readonly name: string;
  private readonly model: LanguageModel;

  constructor(
    readonly config: RealProviderConfig,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.name = `${config.provider}:${config.model}`;
    this.model = languageModel(config, env);
  }

  async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    const result = await generateText({
      model: this.model,
      system: request.system,
      prompt: request.prompt,
      output: Output.object({ schema: request.schema, name: request.task }),
      temperature: 0,
      maxRetries: 2,
    });
    return parseOutput(request, result.output);
  }
}
