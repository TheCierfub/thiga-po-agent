import { z } from "zod";

export const SIZES = ["XS", "S", "M", "L", "XL"] as const;
export const SizeSchema = z.enum(SIZES);
export type Size = z.infer<typeof SizeSchema>;

export const ContactSchema = z.object({
  nom: z.string(),
  email: z.string(),
  role: z.string(),
  pseudos: z.array(z.object({ reseau: z.string(), pseudo: z.string() })),
});

export const AccountSchema = z.object({
  id: z.string(),
  identifiant_interne: z.string(),
  nom: z.string(),
  offre: z.enum(["Free", "Pro", "Enterprise"]),
  arr: z.number().nonnegative(),
  statut: z.string(),
  risque_churn: z.enum(["faible", "moyen", "élevé"]),
  contacts: z.array(ContactSchema),
  notes: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountsFileSchema = z.object({
  devise: z.string(),
  comptes: z.array(AccountSchema),
});

export const BacklogIssueSchema = z.object({
  id: z.string().regex(/^LIN-\d+$/),
  titre: z.string(),
  description: z.string(),
  statut: z.string(),
  priorite: z.string(),
  estimation: SizeSchema,
  points: z.number().positive(),
});
export type BacklogIssue = z.infer<typeof BacklogIssueSchema>;

export const BacklogFileSchema = z.object({
  outil: z.string(),
  workspace: z.string(),
  equipe: z.string(),
  issues: z.array(BacklogIssueSchema),
});

export const StrategySchema = z
  .object({
    company: z.string(),
    product: z.string(),
    currentRelease: z.object({ version: z.string(), releasedOn: z.iso.date() }),
    okrs: z.array(z.object({ id: z.string(), title: z.string(), keyResult: z.string() })).min(1),
    nonGoals: z.array(z.string()),
    capacity: z.object({
      cycle: z.object({ start: z.iso.date(), end: z.iso.date() }),
      grossPoints: z.number().positive(),
      committedIssueIds: z.array(z.string()),
      committedPoints: z.number().nonnegative(),
      mustAlertRatio: z.number().gt(0).lt(1),
      shouldLineRatio: z.number().gt(0).lte(1),
      couldBudgetRatio: z.number().gt(0).lt(1),
    }),
    sizePoints: z.record(SizeSchema, z.number().positive()),
    referenceStories: z
      .array(z.object({ id: z.string(), title: z.string(), size: SizeSchema }))
      .min(1),
  })
  .refine((s) => s.capacity.committedPoints < s.capacity.grossPoints, {
    message: "La capacité engagée doit rester inférieure à la capacité brute.",
  });
export type Strategy = z.infer<typeof StrategySchema>;

export function arbitrablePoints(strategy: Strategy): number {
  return strategy.capacity.grossPoints - strategy.capacity.committedPoints;
}
