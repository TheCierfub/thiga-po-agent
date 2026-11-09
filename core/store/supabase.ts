import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { feedbackToRow, rowToFeedback, type FeedbackRow } from "./rows";
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

interface PostgrestError {
  message: string;
  code?: string;
}

function raise(error: PostgrestError | null): void {
  if (error) throw new StoreError(error.message, error.code);
}

/**
 * Client serveur. La clé est la clé publishable : elle ouvre le rôle anon,
 * et seules les politiques RLS de ces tables s'appliquent. Aucune session n'est conservée.
 */
export function createSupabaseStore(config: { url: string; key: string }): AnalysisStore {
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseAnalysisStore(client);
}

export class SupabaseAnalysisStore implements AnalysisStore {
  constructor(private readonly client: SupabaseClient) {}

  async ping(): Promise<void> {
    const { error } = await this.client.from("analysis_runs").select("batch").limit(1);
    raise(error);
  }

  async listFeedbacks(batch?: string): Promise<StoredFeedback[]> {
    let query = this.client.from("feedbacks").select("*").order("received_at", { ascending: true }).limit(1000);
    if (batch) query = query.eq("batch", batch);
    const { data, error } = await query;
    raise(error);
    return ((data ?? []) as FeedbackRow[]).map(rowToFeedback);
  }

  async upsertFeedbacks(rows: StoredFeedback[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.from("feedbacks").upsert(
      rows.map((row) => feedbackToRow(row.feedback, row.origin)),
      { onConflict: "id" },
    );
    raise(error);
  }

  async deleteFeedback(id: string): Promise<void> {
    const { error } = await this.client.from("feedbacks").delete().eq("id", id);
    raise(error);
  }

  async getRun(batch: string): Promise<StoredRun | null> {
    const { data, error } = await this.client
      .from("analysis_runs")
      .select("state, new_feedback_ids, changes")
      .eq("batch", batch)
      .maybeSingle();
    raise(error);
    if (!data) return null;
    const row = data as { state: unknown; new_feedback_ids: unknown; changes: unknown };
    try {
      return assertStoredRun({
        state: row.state as StoredRun["state"],
        newFeedbackIds: row.new_feedback_ids as string[],
        changes: row.changes as StoredRun["changes"],
      });
    } catch (error) {
      if (error instanceof StoreError) throw new StoreError(`Lot ${batch} : ${error.message}`, error.code);
      throw error;
    }
  }

  async saveRun(run: StoredRun): Promise<void> {
    const stored = assertStoredRun(run);
    const { error } = await this.client.from("analysis_runs").upsert(
      {
        batch: stored.state.batch,
        state: stored.state,
        new_feedback_ids: stored.newFeedbackIds,
        changes: stored.changes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "batch" },
    );
    raise(error);
  }

  async getArbitrages(batch: string): Promise<StoredArbitrages | null> {
    const { data, error } = await this.client
      .from("po_arbitrages")
      .select("decisions, overrides")
      .eq("batch", batch)
      .maybeSingle();
    raise(error);
    if (!data) return null;
    const row = data as { decisions: StoredArbitrages["decisions"]; overrides: StoredArbitrages["overrides"] };
    try {
      return assertArbitrages(row);
    } catch (error) {
      if (error instanceof StoreError) throw new StoreError(`Arbitrages ${batch} : ${error.message}`, error.code);
      throw error;
    }
  }

  async saveArbitrages(batch: string, value: StoredArbitrages): Promise<void> {
    const stored = assertArbitrages(value);
    const { error } = await this.client.from("po_arbitrages").upsert(
      { batch, decisions: stored.decisions, overrides: stored.overrides, updated_at: new Date().toISOString() },
      { onConflict: "batch" },
    );
    raise(error);
  }

  async resetDemo(input: DemoReset): Promise<void> {
    const deleted = await this.client.from("feedbacks").delete().neq("id", "");
    raise(deleted.error);
    await this.upsertFeedbacks(input.feedbacks.map((feedback) => ({ feedback, origin: "seed" })));
    for (const run of input.runs) await this.saveRun(run);
    for (const entry of input.arbitrages) await this.saveArbitrages(entry.batch, entry.value);
  }
}
