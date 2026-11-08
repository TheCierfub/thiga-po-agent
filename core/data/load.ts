import { readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import {
  AccountsFileSchema,
  BacklogFileSchema,
  BatchFileSchema,
  StrategySchema,
  type Account,
  type BacklogIssue,
  type BatchFile,
  type Strategy,
} from "../schemas";
import { PoDecisionsSchema, type PoDecisions } from "../decisions/po-decisions";

export const BATCH_FILES = {
  lundi: "data/feedbacks/batch-lundi.json",
  jeudi: "data/feedbacks/batch-jeudi.json",
  holdout: "data/feedbacks/holdout.json",
} as const;
export type BatchName = keyof typeof BATCH_FILES;

export function isBatchName(value: string): value is BatchName {
  return Object.hasOwn(BATCH_FILES, value);
}

function readJson<S extends z.ZodType>(root: string, relative: string, schema: S): z.infer<S> {
  const file = path.join(root, relative);
  const parsed = schema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`${relative} ne respecte pas son schéma : ${parsed.error.message}`);
  }
  return parsed.data;
}

export interface Context {
  accounts: Account[];
  backlog: BacklogIssue[];
  strategy: Strategy;
}

export function loadContext(root: string): Context {
  return {
    accounts: readJson(root, "data/context/accounts.json", AccountsFileSchema).comptes,
    backlog: readJson(root, "data/context/backlog.json", BacklogFileSchema).issues,
    strategy: readJson(root, "data/context/strategy.json", StrategySchema),
  };
}

export function loadBatchFile(root: string, batch: BatchName): BatchFile {
  return readJson(root, BATCH_FILES[batch], BatchFileSchema);
}

export function loadPoDecisions(root: string, relative: string): PoDecisions {
  return readJson(root, relative, PoDecisionsSchema);
}
