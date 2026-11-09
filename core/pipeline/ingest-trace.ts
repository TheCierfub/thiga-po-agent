import { z } from "zod";

export const IngestTraceSchema = z.object({
  feedbackId: z.string(),
  steps: z.array(z.object({ name: z.string(), durationMs: z.number().nonnegative() })),
  calls: z.array(
    z.object({
      task: z.string(),
      key: z.string(),
      durationMs: z.number().nonnegative(),
      promptTokens: z.number().int().nonnegative().nullable(),
      completionTokens: z.number().int().nonnegative().nullable(),
      reasoningTokens: z.number().int().nonnegative().nullable(),
      costUsd: z.number().nullable(),
    }),
  ),
  costUsd: z.number().nullable(),
  decision: z
    .object({
      engine: z.string(),
      choice: z.string(),
      confidence: z.number().nullable(),
      probability: z.number().nullable(),
      fallbackUsed: z.boolean(),
      attached: z.boolean(),
    })
    .nullable()
    .optional(),
  themes: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      created: z.boolean(),
      rationale: z.string().nullable(),
      relatedThemeIds: z.array(z.string()),
      riceBefore: z.number().nullable(),
      riceAfter: z.number(),
      moscowBefore: z.string().nullable(),
      moscowAfter: z.string(),
    }),
  ),
});

export interface IngestCall {
  task: string;
  key: string;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number | null;
}

export interface IngestStep {
  name: string;
  durationMs: number;
}

export interface IngestThemeMove {
  key: string;
  title: string;
  created: boolean;
  rationale: string | null;
  relatedThemeIds: string[];
  riceBefore: number | null;
  riceAfter: number;
  moscowBefore: string | null;
  moscowAfter: string;
}

export interface IngestDecision {
  engine: string;
  choice: string;
  confidence: number | null;
  probability: number | null;
  fallbackUsed: boolean;
  attached: boolean;
}

export interface IngestTrace {
  feedbackId: string;
  steps: IngestStep[];
  calls: IngestCall[];
  costUsd: number | null;
  themes: IngestThemeMove[];
  decision?: IngestDecision | null;
}

export interface TimedCall {
  task: string;
  key: string;
  durationMs: number;
}

const STEP_OF: Record<string, string> = {
  classify: "classification",
  group: "rattachement",
  assess: "reevaluation",
  story: "redaction",
  investigate: "investigation",
};

const TEXT_TASKS = new Set(Object.keys(STEP_OF));

export function stepDurations(calls: TimedCall[], writeMs: number): IngestStep[] {
  const totals = new Map<string, number>();
  for (const call of calls) {
    const name = TEXT_TASKS.has(call.task) ? STEP_OF[call.task]! : "decision";
    totals.set(name, (totals.get(name) ?? 0) + call.durationMs);
  }
  const steps = ["classification", "rattachement", "reevaluation", "ecriture"].map((name) => ({
    name,
    durationMs: name === "ecriture" ? writeMs : (totals.get(name) ?? 0),
  }));
  if (totals.has("decision")) steps.unshift({ name: "decision", durationMs: totals.get("decision") ?? 0 });
  for (const name of ["redaction", "investigation"]) {
    const durationMs = totals.get(name);
    if (durationMs) steps.push({ name, durationMs });
  }
  return steps;
}

export function themeMoves(
  themes: {
    key: string;
    title: string;
    status: string;
    newFeedbackIds: string[];
    riceBefore: number | null;
    riceAfter: number;
    moscowBefore: string | null;
    moscowAfter: string;
  }[],
  rationaleFor: (key: string) => { rationale: string | null; relatedThemeIds: string[] },
): IngestThemeMove[] {
  return themes
    .filter(
      (theme) =>
        theme.newFeedbackIds.length > 0 ||
        theme.status === "nouveau" ||
        theme.status === "preuves_modifiees" ||
        theme.riceBefore !== theme.riceAfter ||
        theme.moscowBefore !== theme.moscowAfter,
    )
    .map((theme) => {
      const extra = rationaleFor(theme.key);
      return {
        key: theme.key,
        title: theme.title,
        created: theme.status === "nouveau",
        rationale: extra.rationale,
        relatedThemeIds: extra.relatedThemeIds,
        riceBefore: theme.riceBefore,
        riceAfter: theme.riceAfter,
        moscowBefore: theme.moscowBefore,
        moscowAfter: theme.moscowAfter,
      };
    });
}

export function costOf(calls: IngestCall[]): number | null {
  if (calls.every((call) => call.costUsd === null)) return null;
  return calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
}

export const STEP_LABEL: Record<string, string> = {
  decision: "Décision",
  classification: "Classification",
  rattachement: "Rattachement",
  reevaluation: "Réévaluation",
  ecriture: "Écriture en base",
  redaction: "Rédaction",
  investigation: "Investigation",
};

export function formatUsd(value: number): string {
  return `${value.toFixed(4)} $`;
}
