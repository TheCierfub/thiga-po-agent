import { cacheLife } from "next/cache";
import type { ChangeReport } from "@/core/pipeline/run";
import type { RunState } from "@/core/pipeline/state";
import { buildRecontactDrafts, type RecontactDraft } from "@/core/outbox/recontact";
import type { Account, BacklogIssue, Strategy } from "@/core/schemas";
import type { DemoBatch } from "./batches";
import { demoRun } from "./runs";

export type AccountView = Pick<Account, "id" | "nom" | "offre" | "arr" | "risque_churn" | "statut">;

/** Sortie du pipeline, sérialisable, sans les contacts des comptes. */
export interface BatchView {
  batch: DemoBatch;
  state: RunState;
  newFeedbackIds: string[];
  changes: ChangeReport | null;
  accounts: Record<string, AccountView>;
  backlog: BacklogIssue[];
  strategy: Strategy;
  drafts: RecontactDraft[];
}

export async function getBatchView(batch: DemoBatch): Promise<BatchView> {
  "use cache";
  cacheLife("max");
  const r = await demoRun(batch);
  const accounts: Record<string, AccountView> = {};
  for (const a of r.accounts.values()) {
    accounts[a.id] = { id: a.id, nom: a.nom, offre: a.offre, arr: a.arr, risque_churn: a.risque_churn, statut: a.statut };
  }
  return {
    batch,
    state: r.state,
    newFeedbackIds: r.newFeedbackIds,
    changes: r.changes,
    accounts,
    backlog: r.backlog,
    strategy: r.strategy,
    drafts: buildRecontactDrafts(r.state),
  };
}
