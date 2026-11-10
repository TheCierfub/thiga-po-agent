import { LinearMark } from "@/components/etai/linear-mark";
import type { LinearView } from "@/core/linear/present";
import { cn } from "@/lib/utils";

/** Bouton d'en-tête. Le vert n'est là que pour une clé personnelle. */
export function LinearHeaderBadge({ view }: { view: LinearView }) {
  const green = view.tone === "vert";
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-[min(100%,18rem)] items-center gap-1.5 rounded-full border px-2.5 text-xs text-foreground",
        green ? "border-ok-fg/30 bg-ok-bg" : "border-border",
      )}
    >
      {green ? <span className="size-1.5 shrink-0 rounded-full bg-ok-fg" data-slot="linear-dot" /> : null}
      <LinearMark className="size-3.5 shrink-0" />
      <span className="truncate">{view.label}</span>
    </span>
  );
}
