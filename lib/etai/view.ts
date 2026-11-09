import { cache } from "react";
import { cacheLife } from "next/cache";
import { loadContext } from "@/core/data/load";
import type { ChangeReport } from "@/core/pipeline/run";
import type { RunState } from "@/core/pipeline/state";
import { buildRecontactDrafts, type RecontactDraft } from "@/core/outbox/recontact";
import { NO_OVERRIDES, type PoOverrides } from "@/core/scoring/overrides";
import type { Account, BacklogIssue, Strategy } from "@/core/schemas";
import type { DemoBatch } from "./batches";
import { DEMO_DETAIL, resolveDataMode } from "./data-mode";
import { ROOT, demoRun } from "./runs";

export type AccountView = Pick<Account, "id" | "nom" | "offre" | "arr" | "risque_churn" | "statut">;

export type DataModeKind = "demo" | "live";

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
  dataMode: DataModeKind;
  dataModeDetail: string;
  overrides: PoOverrides;
}

function toView(
  batch: DemoBatch,
  source: { state: RunState; newFeedbackIds: string[]; changes: ChangeReport | null },
  meta: { dataMode: DataModeKind; dataModeDetail: string; overrides: PoOverrides },
): BatchView {
  const context = loadContext(ROOT);
  const accounts: Record<string, AccountView> = {};
  for (const account of context.accounts) {
    accounts[account.id] = {
      id: account.id,
      nom: account.nom,
      offre: account.offre,
      arr: account.arr,
      risque_churn: account.risque_churn,
      statut: account.statut,
    };
  }
  return {
    batch,
    state: source.state,
    newFeedbackIds: source.newFeedbackIds,
    changes: source.changes,
    accounts,
    backlog: context.backlog,
    strategy: context.strategy,
    drafts: buildRecontactDrafts(source.state),
    ...meta,
  };
}

/** Fixtures, sans réseau. Mis en cache : le mode direct ne passe pas par ici. */
export async function getDemoBatchView(batch: DemoBatch): Promise<BatchView> {
  "use cache";
  cacheLife("max");
  const run = await demoRun(batch);
  return toView(
    batch,
    { state: run.state, newFeedbackIds: run.newFeedbackIds, changes: run.changes },
    { dataMode: "demo", dataModeDetail: DEMO_DETAIL, overrides: NO_OVERRIDES },
  );
}

export const getBatchView = cache(async (batch: DemoBatch): Promise<BatchView> => {
  const mode = await resolveDataMode();
  if (mode.kind === "live") {
    try {
      const stored = mode.runs[batch];
      const arbitrages = await mode.store.getArbitrages(batch);
      const known = new Set(mode.runs.lundi.state.feedbacks.map((feedback) => feedback.id));
      const newFeedbackIds =
        batch === "jeudi"
          ? stored.state.feedbacks.filter((feedback) => !known.has(feedback.id)).map((feedback) => feedback.id)
          : stored.newFeedbackIds;
      return toView(
        batch,
        { state: stored.state, newFeedbackIds, changes: stored.changes },
        { dataMode: "live", dataModeDetail: mode.detail, overrides: arbitrages?.overrides ?? NO_OVERRIDES },
      );
    } catch (error) {
      const demo = await getDemoBatchView(batch);
      const message = error instanceof Error ? error.message : String(error);
      return { ...demo, dataModeDetail: `Lecture du lot impossible (${message}). Repli sur les fixtures.` };
    }
  }
  const demo = await getDemoBatchView(batch);
  return mode.detail === DEMO_DETAIL ? demo : { ...demo, dataModeDetail: mode.detail };
});
