import { z } from "zod";
import { MoscowClassSchema } from "../schemas";

/** Contrat de persistance du rapport de changements. Aligné sur ChangeReport. */
export const ChangeReportSchema = z.object({
  previousBatch: z.string(),
  plan: z.object({
    newThemes: z.array(z.string()),
    changedEvidence: z.array(z.string()),
    changedAssumptions: z.array(z.string()),
    unchanged: z.array(z.string()),
    reassess: z.array(z.string()),
    recompute: z.literal("tous"),
    staleStories: z.array(z.string()),
    staleConfirmations: z.array(z.string()),
  }),
  themes: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      status: z.enum(["nouveau", "preuves_modifiees", "hypotheses_modifiees", "inchange"]),
      newFeedbackIds: z.array(z.string()),
      accountsAdded: z.array(z.string()),
      accountsRemoved: z.array(z.object({ accountId: z.string(), reason: z.string() })),
      riceBefore: z.number().nullable(),
      riceAfter: z.number(),
      confidenceBefore: z.number().nullable(),
      confidenceAfter: z.number(),
      moscowBefore: MoscowClassSchema.nullable(),
      moscowAfter: MoscowClassSchema,
      reasonAfter: z.string(),
    }),
  ),
  newQuarantines: z.array(z.string()),
  newInvestigations: z.array(z.string()),
});
