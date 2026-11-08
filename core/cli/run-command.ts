import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadPoDecisions, type BatchName } from "../data/load";
import { EMPTY_PO_DECISIONS } from "../decisions/po-decisions";
import { RecordingProvider, ReplayProvider } from "../llm/fixtures";
import type { LlmProvider } from "../llm/provider";
import { RealProvider, readRealProviderConfig } from "../llm/real";
import { runBatch, type RunResult } from "../pipeline/run";
import { loadState, saveState, type RunState } from "../pipeline/state";
import { renderBrief, renderChanges, renderInvestigation, renderPrioritization, renderStory } from "../report/markdown";
import type { ReachMode } from "../schemas";
import { buildBacklogItems, type SinkResult } from "../sink/backlog-sink";
import { MarkdownSink } from "../sink/markdown-sink";

export type CliBatch = Exclude<BatchName, "holdout">;

/** Lot dont dépend chaque lot : jeudi reprend les décisions de lundi. */
export const PREVIOUS_BATCH: Record<CliBatch, CliBatch | null> = { lundi: null, jeudi: "lundi" };

export interface RunCommandOptions {
  root: string;
  batch: CliBatch;
  provider: "replay" | "real";
  record: boolean;
  reachMode: ReachMode;
  decisionsFile: string | null;
  outDir: string;
  allowStaleFixtures: boolean;
  log: (line: string) => void;
}

export interface BatchOutput {
  result: RunResult;
  files: string[];
  sink: SinkResult[];
  fixtureNotes: string[];
}

export function createProvider(options: Pick<RunCommandOptions, "root" | "provider" | "record" | "allowStaleFixtures">): {
  provider: LlmProvider;
  replay: ReplayProvider | null;
} {
  const fixtures = path.join(options.root, "fixtures/llm");
  if (options.provider === "replay") {
    const replay = new ReplayProvider(fixtures, { allowStale: options.allowStaleFixtures });
    return { provider: replay, replay };
  }
  const config = readRealProviderConfig();
  const real = new RealProvider(config);
  return {
    provider: options.record ? new RecordingProvider(real, fixtures, "enregistree", real.name) : real,
    replay: null,
  };
}

async function runOne(
  options: RunCommandOptions,
  batch: CliBatch,
  previous: RunState | null,
  provider: LlmProvider,
): Promise<BatchOutput> {
  const decisions = options.decisionsFile ? loadPoDecisions(options.root, options.decisionsFile) : EMPTY_PO_DECISIONS;
  const result = await runBatch({ root: options.root, batch, provider, reachMode: options.reachMode, decisions, previous });
  saveState(options.outDir, result.state);

  const dir = path.join(options.outDir, batch);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const write = (name: string, content: string) => {
    const file = path.join(dir, name);
    writeFileSync(file, content);
    files.push(file);
  };
  write("brief.md", renderBrief(result));
  write("priorisation.md", renderPrioritization(result));
  if (result.story) write(`story-${result.story.themeKey}.md`, renderStory(result.story));
  const fresh = new Set(result.newFeedbackIds);
  for (const draft of result.state.investigations.filter((i) => fresh.has(i.feedbackId))) {
    write(`investigation-${draft.feedbackId}.md`, renderInvestigation(draft));
  }
  if (result.changes) write("changements.md", renderChanges(result));

  const sink = await new MarkdownSink(path.join(options.outDir, "backlog")).push(buildBacklogItems(result));
  return { result, files, sink, fixtureNotes: [] };
}

/** Lance le lot demandé. Si son lot précédent n'a jamais tourné, il est lancé d'abord. */
export async function runCommand(options: RunCommandOptions): Promise<BatchOutput[]> {
  const { provider, replay } = createProvider(options);
  const outputs: BatchOutput[] = [];
  const previousBatch = PREVIOUS_BATCH[options.batch];
  let previous: RunState | null = null;
  if (previousBatch) {
    previous = loadState(options.outDir, previousBatch);
    if (!previous) {
      options.log(`Aucun état pour le lot ${previousBatch} : il est lancé d'abord.`);
      const first = await runOne(options, previousBatch, null, provider);
      outputs.push(first);
      previous = first.result.state;
    } else {
      options.log(`Décisions du lot ${previousBatch} reprises depuis ${path.relative(options.root, path.join(options.outDir, "state", `${previousBatch}.json`))}.`);
    }
  }
  outputs.push(await runOne(options, options.batch, previous, provider));

  if (replay) {
    const origins = new Set(replay.origins.values());
    const note = origins.has("redigee")
      ? "Mode rejoué : réponses LLM rédigées à la main (fixtures/llm), pas produites par un modèle."
      : "Mode rejoué : réponses LLM enregistrées depuis un modèle réel.";
    outputs.at(-1)!.fixtureNotes.push(note);
    if (replay.staleKeys.length > 0) {
      outputs.at(-1)!.fixtureNotes.push(`Fixtures obsolètes utilisées quand même : ${replay.staleKeys.join(", ")}.`);
    }
  }
  return outputs;
}
