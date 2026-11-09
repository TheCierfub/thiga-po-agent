import type { z } from "zod";
import { loadBatchFile, loadContext, loadPoDecisions } from "../data/load";
import { buildIdentityIndex, matchAuthor } from "../identity/match";
import { ingestBatch } from "../ingest/connectors";
import type { DecisionEngine, DecisionRequest, DecisionResult } from "../llm/decisions";
import type { DecisionPlan } from "../llm/profiles";
import type { LlmProvider, LlmRequest } from "../llm/provider";
import { runBatch, type RunResult } from "../pipeline/run";
import { maskFeedback } from "../privacy/mask";
import { evaluate, loadAnswerKey, type EvalReport } from "./evaluate";

/** Capture tout ce qui part vers un modèle, pour vérifier l'absence de données personnelles. */
export class PromptCapture {
  readonly prompts: string[] = [];

  wrap(provider: LlmProvider): LlmProvider {
    const prompts = this.prompts;
    return {
      name: provider.name,
      generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
        prompts.push(request.prompt);
        return provider.generate(request);
      },
    };
  }

  wrapPlan(plan: DecisionPlan): DecisionPlan {
    const wrapped = new Map<DecisionEngine, DecisionEngine>();
    const prompts = this.prompts;
    const out: DecisionPlan = {};
    for (const [step, engine] of Object.entries(plan) as [keyof DecisionPlan, DecisionEngine][]) {
      let w = wrapped.get(engine);
      if (!w) {
        w = {
          name: engine.name,
          decide(request: DecisionRequest): Promise<DecisionResult> {
            prompts.push(JSON.stringify(request.state));
            return engine.decide(request);
          },
        };
        wrapped.set(engine, w);
      }
      out[step] = w;
    }
    return out;
  }
}

export interface EvalRuntime {
  provider: LlmProvider;
  decider: DecisionPlan;
}

export interface EvaluationRun {
  report: EvalReport;
  lundi: RunResult;
  jeudi: RunResult;
  holdout: RunResult | null;
}

/**
 * Lundi, puis jeudi sur l'état de lundi. Avec `holdout`, le lot holdout passe ensuite dans le pipeline
 * (jamais enregistré en fixture). `recording`, s'il est fourni, sert pour lundi et jeudi seulement.
 */
export async function runEvaluation(options: {
  root: string;
  runtime: EvalRuntime;
  recording?: EvalRuntime;
  withHoldout: boolean;
  onStage?: (stage: string) => void;
}): Promise<EvaluationRun> {
  const { root } = options;
  const key = loadAnswerKey(root);
  const decisions = loadPoDecisions(root, "data/po-decisions.json");
  const capture = new PromptCapture();
  const main = options.recording ?? options.runtime;
  const provider = capture.wrap(main.provider);
  const decider = capture.wrapPlan(main.decider);

  options.onStage?.("lundi");
  const lundi = await runBatch({ root, batch: "lundi", provider, decider, reachMode: "comptes", decisions, previous: null, draftStory: true });
  options.onStage?.("jeudi");
  const jeudi = await runBatch({ root, batch: "jeudi", provider, decider, reachMode: "comptes", decisions, previous: lundi.state, draftStory: true });

  let holdout: RunResult | null = null;
  if (options.withHoldout) {
    options.onStage?.("holdout");
    holdout = await runBatch({
      root,
      batch: "holdout",
      provider: capture.wrap(options.runtime.provider),
      decider: capture.wrapPlan(options.runtime.decider),
      reachMode: "comptes",
      decisions,
      previous: jeudi.state,
      draftStory: false,
    });
  }

  const context = loadContext(root);
  const holdoutFeedbacks = ingestBatch(loadBatchFile(root, "holdout")).map(maskFeedback);
  const index = buildIdentityIndex(context.accounts);
  const report = evaluate({
    key,
    lundi,
    jeudi,
    holdout,
    holdoutDeterministic: { feedbacks: holdoutFeedbacks, matches: holdoutFeedbacks.map((f) => matchAuthor(f, index)) },
    prompts: capture.prompts,
  });
  return { report, lundi, jeudi, holdout };
}
