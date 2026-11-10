import { LinearMark } from "@/components/etai/linear-mark";
import { formatTeamLabel, readExportMode } from "@/lib/etai/export-mode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export async function ExportStatus() {
  const { connected, team } = await readExportMode();
  const label = formatTeamLabel(team);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={
              connected
                ? "inline-flex h-7 items-center gap-1.5 rounded-full border border-ok-fg/30 bg-ok-bg px-2.5 text-xs text-ok-fg"
                : "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground"
            }
          />
        }
      >
        <span className={connected ? "size-1.5 rounded-full bg-ok-fg" : "size-1.5 rounded-full bg-muted-foreground"} />
        <LinearMark className={connected ? "size-3.5" : "size-3.5 opacity-45"} />
        {connected ? "Linear connecté" : "Linear déconnecté"}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 leading-relaxed">
        {connected
          ? `Les exports créent ou mettent à jour des issues dans l'équipe ${label ?? "Linear"}.`
          : "Linear ne répond pas. Rien n'est envoyé."}
      </TooltipContent>
    </Tooltip>
  );
}

export function ExportStatusFallback() {
  return <span className="inline-flex h-7 w-36 animate-pulse rounded-full border bg-muted/50" />;
}
