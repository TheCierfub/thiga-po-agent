import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  AllocationSchema,
  AuthorMatchSchema,
  FeedbackClassificationSchema,
  InvestigationDraftSchema,
  MaskedFeedbackSchema,
  ReachModeSchema,
  RiceScoreSchema,
  FeedbackAttachmentSchema,
  ThemeAssessmentSchema,
  CapacityFreedSchema,
  ThemeSchema,
  UserStoryDraftSchema,
} from "../schemas";

export const RunStateSchema = z.object({
  version: z.literal(1),
  batch: z.string(),
  referenceDate: z.iso.date(),
  reachMode: ReachModeSchema,
  /** Texte remplacé par le texte masqué et e-mail d'auteur retiré. Restent le nom et le pseudo public de l'auteur. */
  feedbacks: z.array(MaskedFeedbackSchema),
  matches: z.array(AuthorMatchSchema),
  classifications: z.array(FeedbackClassificationSchema),
  themes: z.array(ThemeSchema),
  assessments: z.array(ThemeAssessmentSchema),
  rice: z.array(RiceScoreSchema),
  allocation: AllocationSchema,
  evidence: z.record(z.string(), z.string()),
  assumptions: z.record(z.string(), z.string()),
  stories: z.array(UserStoryDraftSchema),
  investigations: z.array(InvestigationDraftSchema),
  warnings: z.array(z.string()),
  /** Rattachements décidés lors d'un ajout en direct. Absent des lots rejoués. */
  attachments: z.array(FeedbackAttachmentSchema).optional(),
  /** Montées de classe après un export. Absent des lots rejoués. */
  capacityFreed: z.array(CapacityFreedSchema).optional(),
});
export type RunState = z.infer<typeof RunStateSchema>;

export function statePath(outDir: string, batch: string): string {
  return path.join(outDir, "state", `${batch}.json`);
}

export function loadState(outDir: string, batch: string): RunState | null {
  const file = statePath(outDir, batch);
  if (!existsSync(file)) return null;
  return RunStateSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function saveState(outDir: string, state: RunState): string {
  const file = statePath(outDir, state.batch);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  return file;
}
