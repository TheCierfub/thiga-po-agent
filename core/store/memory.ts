import { feedbackToRow, rowToFeedback } from "./rows";
import {
  StoreError,
  assertArbitrages,
  assertStoredRun,
  type AnalysisStore,
  type DemoReset,
  type StoredArbitrages,
  type StoredFeedback,
  type StoredRun,
} from "./types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Même contrat que Supabase, sans réseau. Les lectures repassent par les schémas Zod. */
export class MemoryStore implements AnalysisStore {
  private feedbacks = new Map<string, StoredFeedback>();
  private runs = new Map<string, StoredRun>();
  private arbitrages = new Map<string, StoredArbitrages>();
  failPing = false;

  async ping(): Promise<void> {
    if (this.failPing) throw new StoreError("base indisponible", "ping");
  }

  async listFeedbacks(batch?: string): Promise<StoredFeedback[]> {
    const rows = [...this.feedbacks.values()]
      .filter((row) => batch === undefined || row.feedback.batch === batch)
      .sort((a, b) => a.feedback.receivedAt.localeCompare(b.feedback.receivedAt) || a.feedback.id.localeCompare(b.feedback.id));
    return rows.map((row) => rowToFeedback(feedbackToRow(row.feedback, row.origin)));
  }

  async upsertFeedbacks(rows: StoredFeedback[]): Promise<void> {
    for (const row of rows) {
      const stored = rowToFeedback(feedbackToRow(row.feedback, row.origin));
      this.feedbacks.set(stored.feedback.id, stored);
    }
  }

  async deleteFeedback(id: string): Promise<void> {
    this.feedbacks.delete(id);
  }

  async getRun(batch: string): Promise<StoredRun | null> {
    const run = this.runs.get(batch);
    return run ? assertStoredRun(clone(run)) : null;
  }

  async saveRun(run: StoredRun): Promise<void> {
    const stored = assertStoredRun(clone(run));
    this.runs.set(stored.state.batch, stored);
  }

  async getArbitrages(batch: string): Promise<StoredArbitrages | null> {
    const value = this.arbitrages.get(batch);
    return value ? assertArbitrages(clone(value)) : null;
  }

  async saveArbitrages(batch: string, value: StoredArbitrages): Promise<void> {
    this.arbitrages.set(batch, assertArbitrages(clone(value)));
  }

  async resetDemo(input: DemoReset): Promise<void> {
    this.feedbacks.clear();
    this.runs.clear();
    this.arbitrages.clear();
    await this.upsertFeedbacks(input.feedbacks.map((feedback) => ({ feedback, origin: "seed" })));
    for (const run of input.runs) await this.saveRun(run);
    for (const entry of input.arbitrages) await this.saveArbitrages(entry.batch, entry.value);
  }

  hasFeedback(id: string): boolean {
    return this.feedbacks.has(id);
  }
}
