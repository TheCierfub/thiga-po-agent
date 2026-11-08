"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavTabs({ batch, storyTheme, drafts }: { batch: string; storyTheme: string | null; drafts: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/${batch}`, label: "Brief de la semaine", match: (p: string) => p === `/${batch}` },
    { href: `/${batch}/priorisation`, label: "Priorisation", match: (p: string) => p.startsWith(`/${batch}/priorisation`) },
    {
      href: storyTheme ? `/${batch}/themes/${storyTheme}` : `/${batch}/priorisation`,
      label: "Thèmes et stories",
      match: (p: string) => p.startsWith(`/${batch}/themes`),
    },
    { href: `/${batch}/recontact`, label: "Recontact", count: drafts, match: (p: string) => p.startsWith(`/${batch}/recontact`) },
  ];
  return (
    <nav aria-label="Écrans" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.label}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm transition-colors duration-150",
              active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count ? (
              <span className="rounded-full bg-muted px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">{t.count}</span>
            ) : null}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-foreground transition-transform duration-200 ease-(--ease-out)",
                active ? "scale-x-100" : "scale-x-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
