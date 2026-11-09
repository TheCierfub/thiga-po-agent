import { Meter } from "./openrouter/meter";
import { buildProfileRuntime, loadProfile, type DecisionPlan } from "./profiles";
import type { LlmProvider } from "./provider";
import { openRouterClientFromEnv } from "./runtime";

/**
 * Profil OpenRouter pour un feedback ajouté en direct.
 * Un compteur neuf par appel : le plafond (ETAI_LLM_BUDGET_USD, défaut 1 $) borne cette analyse.
 */
export function createLiveProvider(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): { provider: LlmProvider; decider: DecisionPlan; meter: Meter } {
  if (!env.OPENROUTER_API_KEY?.trim()) {
    throw new Error("OPENROUTER_API_KEY est absente : le feedback n'est pas envoyé au modèle.");
  }
  const profile = env.ETAI_LLM_PROFILE?.trim() || "A";
  const parsed = Number(env.ETAI_LLM_BUDGET_USD ?? "1");
  const meter = new Meter({ budgetUsd: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 });
  const client = openRouterClientFromEnv({ meter, env });
  const runtime = buildProfileRuntime(loadProfile(root, profile), client);
  return { provider: runtime.provider, decider: runtime.decider, meter };
}
