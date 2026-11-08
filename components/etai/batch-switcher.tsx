"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BATCH_LABEL, DEMO_BATCHES, type DemoBatch } from "@/lib/etai/batches";
import { cn } from "@/lib/utils";

export function BatchSwitcher({ current, fresh }: { current: DemoBatch; fresh: Record<DemoBatch, number> }) {
  const pathname = usePathname();
  const rest = pathname.replace(/^\/[^/]+/, "");
  const index = DEMO_BATCHES.indexOf(current);
  return (
    <nav aria-label="Lot de feedbacks" className="relative grid grid-cols-2 rounded-lg bg-muted p-0.5 text-sm">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm transition-transform duration-200 ease-(--ease-out)"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {DEMO_BATCHES.map((b) => (
        <Link
          key={b}
          href={`/${b}${rest}`}
          aria-current={b === current ? "page" : undefined}
          className={cn(
            "relative z-10 flex items-center justify-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors duration-150",
            b === current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {BATCH_LABEL[b]}
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">+{fresh[b]}</span>
        </Link>
      ))}
    </nav>
  );
}
