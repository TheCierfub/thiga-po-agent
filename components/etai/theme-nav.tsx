"use client";

import Link from "next/link";
import { MOSCOW_ORDER } from "@/lib/etai/labels";
import { useOverrides, usePrioritization } from "@/lib/etai/overrides";
import { cn } from "@/lib/utils";
import { MoscowBadge } from "./bits";

export function ThemeNav({ current }: { current: string }) {
  const { overrides, view } = useOverrides();
  const { decisionByKey, riceByKey } = usePrioritization();
  const stories = new Set(view.state.stories.filter((s) => s.status === "brouillon").map((s) => s.themeKey));
  const themes = [...view.state.themes].sort(
    (a, b) =>
      MOSCOW_ORDER.indexOf(decisionByKey.get(a.key)!.moscow) - MOSCOW_ORDER.indexOf(decisionByKey.get(b.key)!.moscow) ||
      riceByKey.get(b.key)!.score - riceByKey.get(a.key)!.score,
  );
  return (
    <nav aria-label="Thèmes" className="lg:sticky lg:top-32 lg:self-start">
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1">
        {themes.map((t) => (
          <li key={t.key} className="min-w-0">
            <Link
              href={`/${view.batch}/themes/${t.key}`}
              aria-current={t.key === current ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150",
                t.key === current ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 lg:line-clamp-2">{t.title}</span>
              {stories.has(t.key) ? <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">story</span> : null}
              <MoscowBadge value={decisionByKey.get(t.key)!.moscow} forced={Boolean(overrides.forced[t.key])} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ThemeMoscow({ themeKey }: { themeKey: string }) {
  const { overrides } = useOverrides();
  const { decisionByKey } = usePrioritization();
  const d = decisionByKey.get(themeKey);
  return d ? <MoscowBadge value={d.moscow} forced={Boolean(overrides.forced[themeKey])} /> : null;
}
