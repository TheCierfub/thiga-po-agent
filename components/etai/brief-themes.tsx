"use client";

import Link from "next/link";
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import { MOSCOW_ORDER, num } from "@/lib/etai/labels";
import { useOverrides, usePrioritization } from "@/lib/etai/overrides";
import { CategoryBadge, MoscowBadge, TrendBars } from "./bits";

export function BriefThemes() {
  const { overrides, view } = useOverrides();
  const { allocation, riceByKey, decisionByKey } = usePrioritization();
  const assessments = new Map(view.state.assessments.map((a) => [a.themeKey, a]));
  const themes = [...view.state.themes].sort(
    (a, b) =>
      MOSCOW_ORDER.indexOf(decisionByKey.get(a.key)!.moscow) - MOSCOW_ORDER.indexOf(decisionByKey.get(b.key)!.moscow) ||
      riceByKey.get(b.key)!.score - riceByKey.get(a.key)!.score,
  );
  return (
    <div className="space-y-3">
      {allocation.alerts.map((a) => (
        <div key={a.code} className="flex gap-2 rounded-xl border border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p>{a.message}</p>
        </div>
      ))}
      <ul className="divide-y overflow-hidden rounded-xl border">
        {themes.map((t) => {
          const d = decisionByKey.get(t.key)!;
          const r = riceByKey.get(t.key)!;
          const a = assessments.get(t.key);
          return (
            <li key={t.key}>
              <Link
                href={`/${view.batch}/themes/${t.key}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors duration-150 hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_5rem_auto]"
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{t.title}</span>
                    {a ? <CategoryBadge value={a.category} rationale={a.categoryRationale} short /> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{d.reason}</span>
                </span>
                <span className="justify-self-end sm:justify-self-start">
                  <MoscowBadge value={d.moscow} forced={Boolean(overrides.forced[t.key])} />
                </span>
                <TrendBars trend={t.trend} className="hidden sm:inline-flex" />
                <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">RICE {num(r.score, 2)}</span>
                <ChevronRightIcon className="hidden size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 sm:block" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
