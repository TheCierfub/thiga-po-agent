import Link from "next/link";
import type { ReactNode } from "react";
import type { MoscowClass, Trend } from "@/core/schemas";
import { TREND_LABEL } from "@/lib/etai/labels";
import { cn } from "@/lib/utils";

const MOSCOW_STYLE: Record<MoscowClass, string> = {
  Must: "bg-[color-mix(in_oklch,var(--moscow-must)_12%,transparent)] text-(--moscow-must) ring-(--moscow-must)/25",
  Should: "bg-[color-mix(in_oklch,var(--moscow-should)_12%,transparent)] text-(--moscow-should) ring-(--moscow-should)/25",
  Could: "bg-[color-mix(in_oklch,var(--moscow-could)_14%,transparent)] text-(--moscow-could) ring-(--moscow-could)/25",
  "Won't": "bg-muted text-muted-foreground ring-border",
  "À confirmer": "bg-warn-bg text-warn-fg ring-warn-border",
  "Hors arbitrage": "bg-muted text-muted-foreground ring-border",
};

export function MoscowBadge({ value, forced, className }: { value: MoscowClass; forced?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        MOSCOW_STYLE[value],
        className,
      )}
    >
      {value}
      {forced ? <span className="font-normal opacity-75">· PO</span> : null}
    </span>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  index = 0,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <section className={cn("animate-enter", className)} style={{ "--i": index } as React.CSSProperties}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TrendBars({ trend, className }: { trend: Trend; className?: string }) {
  const max = Math.max(1, ...trend.weeklyCounts);
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`${trend.weeklyCounts.join(" / ")} messages par semaine. ${trend.rule}`}>
      <span aria-hidden className="flex h-4 items-end gap-0.5">
        {trend.weeklyCounts.map((c, i) => (
          <span
            key={i}
            className={cn("w-1.5 rounded-sm", trend.kind === "tendance" && i === 3 ? "bg-(--moscow-must)" : "bg-foreground/25")}
            style={{ height: `${Math.max(12, (c / max) * 100)}%` }}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">{TREND_LABEL[trend.kind]}</span>
    </span>
  );
}

export function FeedbackRef({ batch, id, className }: { batch: string; id: string; className?: string }) {
  return (
    <Link
      href={`/${batch}/feedbacks#${id}`}
      className={cn("font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline", className)}
    >
      {id}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", tone === "warn" && "text-(--moscow-must)")}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
