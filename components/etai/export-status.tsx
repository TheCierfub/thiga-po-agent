import { formatTeamLabel, readExportMode } from "@/lib/etai/export-mode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export async function ExportStatus() {
  const { mode, missing, team } = await readExportMode();
  const linear = mode === "linear";
  const label = formatTeamLabel(team);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground" />
        }
      >
        <span className={linear ? "size-1.5 rounded-full bg-ok-fg" : "size-1.5 rounded-full bg-warn-fg"} />
        {linear ? "Export : Linear" : "Export : Markdown local"}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 leading-relaxed">
        {linear
          ? `Les exports créent ou mettent à jour des issues dans l'équipe ${label ?? "Linear"}.`
          : `${missing.join(" et ")} absent(s) : les exports sont écrits dans out/linear-export/, rien n'est envoyé à Linear.`}
      </TooltipContent>
    </Tooltip>
  );
}

export function ExportStatusFallback() {
  return <span className="inline-flex h-7 w-36 animate-pulse rounded-full border bg-muted/50" />;
}
