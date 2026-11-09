import type { Listening } from "@/core/schemas";
import { formatDelay } from "@/core/sources/x-listen";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Paris" });
}

export function SocialMark({
  url,
  listening,
}: {
  url?: string | null;
  listening?: Listening;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className="inline-flex size-4 items-center justify-center rounded-sm bg-foreground text-[9px] font-semibold leading-none text-background"
        title="X"
      >
        X
      </span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
          Voir le post
        </a>
      ) : null}
      {listening ? (
        <span>
          Publié {when(listening.publishedAt)} · détecté {when(listening.detectedAt)} · traité {when(listening.processedAt)}
          {listening.processedAt
            ? ` · indexation ${formatDelay(Date.parse(listening.detectedAt) - Date.parse(listening.publishedAt))} · traitement ${formatDelay(Date.parse(listening.processedAt) - Date.parse(listening.detectedAt))}`
            : ""}
        </span>
      ) : null}
    </span>
  );
}
