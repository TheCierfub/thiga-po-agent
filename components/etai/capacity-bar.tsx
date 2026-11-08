import type { Allocation, Strategy } from "@/core/schemas";
import { num, pct } from "@/lib/etai/labels";

export function CapacityBar({ allocation, strategy }: { allocation: Allocation; strategy: Strategy }) {
  const cap = allocation.arbitrablePoints;
  const { mustAlertRatio, shouldLineRatio, grossPoints, committedPoints, committedIssueIds } = strategy.capacity;
  const used = allocation.mustPoints + allocation.shouldPoints + allocation.couldPoints;
  const segments = [
    { key: "Must", points: allocation.mustPoints, color: "bg-(--moscow-must)" },
    { key: "Should", points: allocation.shouldPoints, color: "bg-(--moscow-should)" },
    { key: "Could", points: allocation.couldPoints, color: "bg-(--moscow-could)" },
  ];
  const scale = Math.max(cap, used);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">
          Capacité du cycle : {num(cap)} points arbitrables
          <span className="font-normal text-muted-foreground">
            {" "}
            ({grossPoints} bruts, {committedPoints} déjà engagés sur {committedIssueIds.join(", ")})
          </span>
        </div>
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          {num(used)} / {num(cap)} pt · {pct(used / cap)}
        </div>
      </div>
      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Must ${allocation.mustPoints} points, Should ${allocation.shouldPoints}, Could ${allocation.couldPoints}, sur ${cap}`}>
        <div className="flex h-full">
          {segments.map((s) => (
            <div
              key={s.key}
              className={`${s.color} h-full transition-[width] duration-300 ease-(--ease-out)`}
              style={{ width: `${(s.points / scale) * 100}%` }}
            />
          ))}
        </div>
        {[mustAlertRatio, shouldLineRatio].map((r) => (
          <span key={r} aria-hidden className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${(r * cap * 100) / scale}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${s.color}`} />
            {s.key} {num(s.points)} pt ({pct(s.points / cap)})
          </span>
        ))}
        <span>Repères : Must ≤ {pct(mustAlertRatio)}, Must + Should ≈ {pct(shouldLineRatio)}</span>
      </div>
    </div>
  );
}
