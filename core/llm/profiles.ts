import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DECISION_STEPS, type DecisionStep } from "../schemas";
import {
  FallbackDecisionEngine,
  LlmDecisionEngine,
  RecordingDecisionEngine,
  type DecisionEngine,
} from "./decisions";
import { RecordingProvider } from "./fixtures";
import { OpenRouterChatProvider } from "./openrouter/chat";
import type { OpenRouterClient } from "./openrouter/client";
import { DecisionsApiEngine } from "./openrouter/decisions-api";
import type { LlmProvider, LlmRequest, LlmTask } from "./provider";

export const TEXT_STEPS = ["classify", "group", "assess", "story", "investigate"] as const;
export type TextStep = (typeof TEXT_STEPS)[number];

const DecisionSpecSchema = z.discriminatedUnion("engine", [
  /** Décidé dans la réponse de l'étape de texte (classification ou regroupement). */
  z.object({ engine: z.literal("inline") }),
  /** Question fermée posée à part à un LLM génératif. */
  z.object({ engine: z.literal("llm"), model: z.string() }),
  /** Modèle de décision de l'API Decisions d'OpenRouter (Jev), avec repli LLM facultatif. */
  z.object({ engine: z.literal("decisions"), model: z.string(), fallback: z.string().nullable() }),
]);
export type DecisionSpec = z.infer<typeof DecisionSpecSchema>;

export const ProfileSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]+$/),
  description: z.string(),
  steps: z.object(Object.fromEntries(TEXT_STEPS.map((s) => [s, z.string().min(1)])) as Record<TextStep, z.ZodString>),
  decisions: z.object(Object.fromEntries(DECISION_STEPS.map((s) => [s, DecisionSpecSchema])) as Record<DecisionStep, typeof DecisionSpecSchema>),
  request: z
    .object({
      temperature: z.number().min(0).max(2).default(0),
      maxTokens: z.number().int().positive().default(4000),
      requireParameters: z.boolean().default(false),
    })
    .prefault({}),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PROFILES_DIR = "config/llm-profiles";

/** Un nom (A, B, C) lit config/llm-profiles/<nom>.json ; un chemin vers un .json est lu tel quel. */
export function loadProfile(root: string, nameOrPath: string): Profile {
  const file = nameOrPath.endsWith(".json") ? path.resolve(root, nameOrPath) : path.join(root, PROFILES_DIR, `${nameOrPath}.json`);
  if (!existsSync(file)) throw new Error(`Profil introuvable : ${path.relative(root, file)}.`);
  return ProfileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function withStoryModel(profile: Profile, storyModel: string | null): Profile {
  return storyModel ? { ...profile, steps: { ...profile.steps, story: storyModel } } : profile;
}

/** Aiguille chaque tâche vers le fournisseur de son étape. */
export class RoutedProvider implements LlmProvider {
  readonly name: string;
  constructor(private readonly routes: Partial<Record<LlmTask, LlmProvider>>) {
    this.name = `routage(${Object.entries(routes)
      .map(([t, p]) => `${t}=${p.name}`)
      .join(", ")})`;
  }
  generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    const target = this.routes[request.task];
    if (!target) throw new Error(`Aucun modèle configuré pour l'étape ${request.task}.`);
    return target.generate(request);
  }
}

export type DecisionPlan = Partial<Record<DecisionStep, DecisionEngine>>;

export interface ProfileRuntime {
  provider: LlmProvider;
  decider: DecisionPlan;
  /** Étapes de décision regroupées par moteur : elles partagent un appel. */
  decisionGroups: DecisionStep[][];
}

export function buildProfileRuntime(
  profile: Profile,
  client: OpenRouterClient,
  options: { recordDir?: string } = {},
): ProfileRuntime {
  const chatCache = new Map<string, LlmProvider>();
  const chat = (model: string): LlmProvider => {
    let p = chatCache.get(model);
    if (!p) {
      p = new OpenRouterChatProvider(client, model, profile.request);
      chatCache.set(model, p);
    }
    return p;
  };
  const record = (task: LlmTask, model: string) =>
    options.recordDir ? new RecordingProvider(chat(model), options.recordDir, "enregistree", model) : chat(model);

  const routes = Object.fromEntries(TEXT_STEPS.map((s) => [s, record(s, profile.steps[s])])) as Record<TextStep, LlmProvider>;

  const engineCache = new Map<string, DecisionEngine>();
  const decider: DecisionPlan = {};
  const groups = new Map<string, DecisionStep[]>();
  for (const step of DECISION_STEPS) {
    const spec = profile.decisions[step];
    if (spec.engine === "inline") continue;
    const cacheKey = JSON.stringify(spec);
    let engine = engineCache.get(cacheKey);
    if (!engine) {
      if (spec.engine === "llm") {
        engine = new LlmDecisionEngine(chat(spec.model));
      } else {
        const primary = new DecisionsApiEngine(client, spec.model);
        engine = spec.fallback
          ? new FallbackDecisionEngine(primary, new LlmDecisionEngine(chat(spec.fallback)), () => client.meter.addFallback())
          : primary;
      }
      if (options.recordDir) engine = new RecordingDecisionEngine(engine, options.recordDir, "enregistree");
      engineCache.set(cacheKey, engine);
    }
    decider[step] = engine;
    groups.set(cacheKey, [...(groups.get(cacheKey) ?? []), step]);
  }
  return { provider: new RoutedProvider(routes), decider, decisionGroups: [...groups.values()] };
}
