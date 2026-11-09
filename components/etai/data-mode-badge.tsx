import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DataModeKind } from "@/lib/etai/view";

export function DataModeBadge({ mode, detail }: { mode: DataModeKind; detail: string }) {
  const live = mode === "live";
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground" />}
      >
        <span className={live ? "size-1.5 rounded-full bg-ok-fg" : "size-1.5 rounded-full bg-warn-fg"} />
        {live ? "Données : Supabase" : "Données : démo"}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-80 leading-relaxed">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}
