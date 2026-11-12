import { LinearConnect } from "@/components/etai/linear-connect";
import { readExportMode } from "@/lib/etai/export-mode";

export async function ExportStatus() {
  const mode = await readExportMode();
  return (
    <LinearConnect
      source={mode.source}
      teamName={mode.team?.name ?? null}
      workspaceName={mode.team?.workspaceName ?? null}
      teamKey={mode.team?.key ?? null}
      teamId={mode.team?.id ?? null}
      viewerName={mode.team?.viewerName ?? null}
    />
  );
}

export function ExportStatusFallback() {
  return <span className="inline-flex h-7 w-36 animate-pulse rounded-full border bg-muted/50" />;
}
