export const DEMO_BATCHES = ["lundi", "jeudi"] as const;
export type DemoBatch = (typeof DEMO_BATCHES)[number];

export function isDemoBatch(value: string): value is DemoBatch {
  return (DEMO_BATCHES as readonly string[]).includes(value);
}

export const BATCH_LABEL: Record<DemoBatch, string> = { lundi: "Lundi", jeudi: "Jeudi" };
