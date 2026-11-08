"use client";

import { createContext, use, useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { NO_OVERRIDES, hasOverrides, reprioritize, type ForceableClass, type PoOverrides } from "@/core/scoring/overrides";
import type { Size } from "@/core/schemas";
import type { DemoBatch } from "./batches";
import type { BatchView } from "./view";

const listeners = new Set<() => void>();
const keyOf = (batch: DemoBatch) => `etai:arbitrages:${batch}`;

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function parse(raw: string | null): PoOverrides {
  if (!raw) return NO_OVERRIDES;
  try {
    const value = JSON.parse(raw) as Partial<PoOverrides>;
    return { effort: value.effort ?? {}, forced: value.forced ?? {} };
  } catch {
    return NO_OVERRIDES;
  }
}

interface OverridesContextValue {
  view: BatchView;
  overrides: PoOverrides;
  active: boolean;
  setEffort(themeKey: string, size: Size | null): void;
  force(themeKey: string, moscow: ForceableClass, motif: string): void;
  unforce(themeKey: string): void;
  reset(): void;
}

const OverridesContext = createContext<OverridesContextValue | null>(null);

/** Arbitrages du PO, propres à chaque lot et gardés dans le navigateur. */
export function OverridesProvider({ view, children }: { view: BatchView; children: ReactNode }) {
  const batch: DemoBatch = view.batch;
  const raw = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(keyOf(batch)),
    () => null,
  );
  const overrides = useMemo(() => parse(raw), [raw]);

  const write = useCallback(
    (next: PoOverrides) => {
      if (hasOverrides(next)) window.localStorage.setItem(keyOf(batch), JSON.stringify(next));
      else window.localStorage.removeItem(keyOf(batch));
      for (const l of listeners) l();
    },
    [batch],
  );

  const value = useMemo<OverridesContextValue>(
    () => ({
      view,
      overrides,
      active: hasOverrides(overrides),
      setEffort(themeKey, size) {
        const effort = { ...overrides.effort };
        if (size) effort[themeKey] = size;
        else delete effort[themeKey];
        write({ ...overrides, effort });
      },
      force(themeKey, moscow, motif) {
        write({ ...overrides, forced: { ...overrides.forced, [themeKey]: { moscow, motif } } });
      },
      unforce(themeKey) {
        const forced = { ...overrides.forced };
        delete forced[themeKey];
        write({ ...overrides, forced });
      },
      reset() {
        write(NO_OVERRIDES);
      },
    }),
    [view, overrides, write],
  );

  return <OverridesContext value={value}>{children}</OverridesContext>;
}

export function useOverrides(): OverridesContextValue {
  const value = use(OverridesContext);
  if (!value) throw new Error("useOverrides doit être appelé sous OverridesProvider.");
  return value;
}

/** RICE et MoSCoW du lot, arbitrages du PO appliqués. */
export function useBatchView(): BatchView {
  return useOverrides().view;
}

export function usePrioritization() {
  const { view, overrides } = useOverrides();
  return useMemo(() => {
    const { rice, allocation } = reprioritize(view.state, view.strategy, overrides);
    return {
      rice,
      allocation,
      riceByKey: new Map(rice.map((r) => [r.themeKey, r])),
      decisionByKey: new Map(allocation.decisions.map((d) => [d.themeKey, d])),
    };
  }, [view.state, view.strategy, overrides]);
}
