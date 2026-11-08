import { z } from "zod";
import { ImpactSchema, SizeSchema } from "../schemas";

/**
 * Ce que le Product Owner a validé. En phase 1, c'est un fichier ; en phase 2, l'interface l'écrit.
 * Une confirmation porte le lot sur lequel elle a été donnée : si les preuves du thème changent
 * ensuite, elle reste affichée mais devient « à revoir ».
 */
export const PoDecisionsSchema = z.object({
  confirmedConstraints: z.array(
    z.object({ themeKey: z.string(), batch: z.string(), note: z.string().optional() }),
  ),
  rejectedConstraints: z.array(z.object({ themeKey: z.string(), batch: z.string() })),
  overrides: z.array(
    z.object({
      themeKey: z.string(),
      impact: ImpactSchema.optional(),
      effortSize: SizeSchema.optional(),
      note: z.string().optional(),
    }),
  ),
  releasedFromQuarantine: z.array(z.string()),
});
export type PoDecisions = z.infer<typeof PoDecisionsSchema>;

export const EMPTY_PO_DECISIONS: PoDecisions = {
  confirmedConstraints: [],
  rejectedConstraints: [],
  overrides: [],
  releasedFromQuarantine: [],
};
