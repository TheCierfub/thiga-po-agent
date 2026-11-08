export class BudgetExceededError extends Error {
  constructor(spent: number, budget: number) {
    super(`Plafond de budget atteint : ${spent.toFixed(4)} $ dépensés sur ${budget.toFixed(2)} $.`);
    this.name = "BudgetExceededError";
  }
}

export interface CallRecord {
  kind: "chat" | "decision";
  step: string;
  model: string;
  latencyMs: number;
  /** Coût en dollars ; null si ni `usage.cost` ni `/generation` ne l'ont donné. */
  costUsd: number | null;
  httpStatus: number;
  ok: boolean;
}

export interface MeterStats {
  calls: number;
  chatCalls: number;
  decisionCalls: number;
  httpErrors: number;
  costUsd: number;
  costUnknownCalls: number;
  latencyMeanMs: number | null;
  latencyP95Ms: number | null;
  schemaErrors: number;
  /** Réponses de chat reçues dont le JSON ne respecte pas le schéma, rapportées aux réponses de chat reçues. */
  schemaErrorRate: number | null;
  decisionParseErrors: number;
  fallbacks: number;
  byStep: Record<string, { calls: number; costUsd: number }>;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

/**
 * Compte les appels, le coût et la latence. Un compteur peut avoir un parent : les appels remontent,
 * et le plafond de budget est celui de la racine.
 */
export class Meter {
  readonly records: CallRecord[] = [];
  schemaErrors = 0;
  decisionParseErrors = 0;
  fallbacks = 0;

  constructor(
    private readonly options: { budgetUsd?: number; parent?: Meter } = {},
  ) {}

  private get root(): Meter {
    return this.options.parent ? this.options.parent.root : this;
  }

  spent(): number {
    return this.records.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  }

  get budgetUsd(): number {
    return this.root.options.budgetUsd ?? Number.POSITIVE_INFINITY;
  }

  /** À appeler avant chaque requête payante. */
  assertBudget(): void {
    const root = this.root;
    const spent = root.spent();
    if (spent >= root.budgetUsd) throw new BudgetExceededError(spent, root.budgetUsd);
  }

  record(call: CallRecord): void {
    this.records.push(call);
    this.options.parent?.record(call);
  }

  addSchemaError(): void {
    this.schemaErrors++;
    this.options.parent?.addSchemaError();
  }

  addDecisionParseError(): void {
    this.decisionParseErrors++;
    this.options.parent?.addDecisionParseError();
  }

  addFallback(): void {
    this.fallbacks++;
    this.options.parent?.addFallback();
  }

  stats(): MeterStats {
    const latencies = this.records.map((r) => r.latencyMs);
    const okChats = this.records.filter((r) => r.kind === "chat" && r.ok).length;
    const byStep: MeterStats["byStep"] = {};
    for (const r of this.records) {
      const s = (byStep[r.step] ??= { calls: 0, costUsd: 0 });
      s.calls++;
      s.costUsd += r.costUsd ?? 0;
    }
    return {
      calls: this.records.length,
      chatCalls: this.records.filter((r) => r.kind === "chat").length,
      decisionCalls: this.records.filter((r) => r.kind === "decision").length,
      httpErrors: this.records.filter((r) => !r.ok).length,
      costUsd: this.spent(),
      costUnknownCalls: this.records.filter((r) => r.ok && r.costUsd === null).length,
      latencyMeanMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
      latencyP95Ms: percentile(latencies, 95),
      schemaErrors: this.schemaErrors,
      schemaErrorRate: okChats ? this.schemaErrors / okChats : null,
      decisionParseErrors: this.decisionParseErrors,
      fallbacks: this.fallbacks,
      byStep,
    };
  }
}
