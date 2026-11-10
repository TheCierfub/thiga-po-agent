"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, FileTextIcon, Loader2Icon, LockIcon } from "lucide-react";
import { toast } from "sonner";
import { exportTheme, type ExportOutcome } from "@/app/actions";
import { LinearMark } from "@/components/etai/linear-mark";
import { Button } from "@/components/ui/button";
import type { UserStoryDraft } from "@/core/schemas";
import type { DemoBatch } from "@/lib/etai/batches";
import { formatTeamLabel, type ExportMode } from "@/lib/etai/export-mode";
import { exportBlock } from "@/lib/etai/labels";
import { useOverrides, usePrioritization } from "@/lib/etai/overrides";
import { cn } from "@/lib/utils";

const ACTION_LABEL = { cree: "Issue créée", mis_a_jour: "Issue mise à jour", inchange: "Déjà à jour, rien n'a changé", bloque: "Export bloqué" } as const;

export function ExportPanel({
  batch,
  themeKey,
  hasStory,
  existingIssueId,
  mode,
  story,
}: {
  batch: DemoBatch;
  themeKey: string;
  hasStory: boolean;
  existingIssueId: string | null;
  mode: ExportMode;
  story?: UserStoryDraft | null;
}) {
  const { overrides } = useOverrides();
  const { decisionByKey } = usePrioritization();
  const block = exportBlock(decisionByKey.get(themeKey));
  const team = formatTeamLabel(mode.team);
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);
  const linear = mode.connected;

  function run() {
    start(async () => {
      const result = await exportTheme({ batch, themeKey, overrides, story: story ?? undefined });
      setOutcome(result);
      if (!result.ok) toast.error("Export impossible", { description: result.message });
      else if (result.result.action === "bloque") toast.warning(ACTION_LABEL.bloque, { description: result.result.reason });
      else toast.success(ACTION_LABEL[result.result.action], { description: result.location ?? undefined });
    });
  }

  return (
    <div className="w-full min-w-0">
      <Button className="h-auto w-full whitespace-normal py-2" size="lg" disabled={block !== null || pending || !hasStory || !linear} onClick={run}>
        <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5">
          {pending ? <Loader2Icon className="animate-spin" /> : block ? <LockIcon className="size-4" /> : null}
          Valider et exporter vers
          <LinearMark className="size-4" />
          Linear
        </span>
      </Button>
      {!linear ? (
        <p className="mt-3 text-xs text-muted-foreground">Linear déconnecté : rien n&apos;est envoyé.</p>
      ) : block ? (
        <p className={cn("mt-3 text-xs", block.tone === "review" ? "font-medium text-warn-fg" : "text-muted-foreground")}>{block.message}</p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {hasStory
            ? existingIssueId
              ? `Envoie la story affichée et met à jour ${existingIssueId} si l’issue existe, sans doublon.`
              : "Envoie la story affichée : critères, citations, liens, estimation et label MoSCoW."
            : "Générez la story avant de la valider."}
        </p>
      )}
      <div className={cn("mt-3 flex gap-2 rounded-lg px-2.5 py-2 text-xs break-words", linear ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg")}>
        {linear ? <CheckCircle2Icon className="mt-px size-3.5 shrink-0" /> : <FileTextIcon className="mt-px size-3.5 shrink-0" />}
        <span>
          {linear
            ? `Linear connecté : l'export écrit dans l'équipe ${team ?? "configurée"}.`
            : "Linear déconnecté : rien n'est envoyé."}
        </span>
      </div>
      {outcome?.ok ? (
        <div className="mt-3 space-y-1 border-t pt-3 text-xs animate-enter">
          <p className="font-medium">
            {ACTION_LABEL[outcome.result.action]}
            {outcome.mode === "markdown" && outcome.result.action !== "bloque" ? " (Markdown local)" : ""}
          </p>
          {outcome.location ? (
            outcome.location.startsWith("http") ? (
              <a href={outcome.location} target="_blank" rel="noreferrer" className="break-all text-muted-foreground underline underline-offset-2">
                {outcome.location}
              </a>
            ) : (
              <p className="break-all font-mono text-muted-foreground">{outcome.location}</p>
            )
          ) : null}
          {outcome.result.reason ? <p className="text-muted-foreground">{outcome.result.reason}</p> : null}
          {outcome.result.notes?.map((n) => (
            <p key={n} className="text-muted-foreground">
              {n}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ExportPanelSkeleton() {
  return <div className="h-28 w-full animate-pulse rounded-lg bg-muted/40" />;
}
