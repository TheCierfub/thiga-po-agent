"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, FileTextIcon, Loader2Icon, LockIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { exportTheme, type ExportOutcome } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { DemoBatch } from "@/lib/etai/batches";
import type { ExportMode } from "@/lib/etai/export-mode";
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
}: {
  batch: DemoBatch;
  themeKey: string;
  hasStory: boolean;
  existingIssueId: string | null;
  mode: ExportMode;
}) {
  const { overrides } = useOverrides();
  const { decisionByKey } = usePrioritization();
  const block = exportBlock(decisionByKey.get(themeKey));
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);
  const linear = mode.mode === "linear";

  function run() {
    start(async () => {
      const result = await exportTheme({ batch, themeKey, overrides });
      setOutcome(result);
      if (!result.ok) toast.error("Export impossible", { description: result.message });
      else if (result.result.action === "bloque") toast.warning(ACTION_LABEL.bloque, { description: result.result.reason });
      else toast.success(ACTION_LABEL[result.result.action], { description: result.location ?? undefined });
    });
  }

  return (
    <div className="w-full shrink-0 rounded-xl border bg-card p-4 xl:w-80">
      <Button className="w-full" size="lg" disabled={block !== null || pending} onClick={run}>
        {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : block ? <LockIcon data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
        Valider et exporter vers Linear
      </Button>
      {block ? (
        <p className={cn("mt-3 text-xs", block.tone === "review" ? "font-medium text-amber-700" : "text-muted-foreground")}>{block.message}</p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {existingIssueId ? `Met à jour ${existingIssueId} si l'issue existe, sans doublon.` : "Crée une issue, ou met à jour celle déjà exportée."}{" "}
          {hasStory ? "Story, critères, citations, liens vers les feedbacks, estimation et label MoSCoW." : "Problème, score, citations, liens, estimation et label MoSCoW."}
        </p>
      )}
      <div className={cn("mt-3 flex gap-2 rounded-lg px-2.5 py-2 text-xs", linear ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
        {linear ? <CheckCircle2Icon className="mt-px size-3.5 shrink-0" /> : <FileTextIcon className="mt-px size-3.5 shrink-0" />}
        <span>
          {linear
            ? "Linear connecté : l'export écrit dans l'équipe LINEAR_TEAM_ID."
            : `Linear non connecté (${mode.missing.join(" et ")} absent${mode.missing.length > 1 ? "s" : ""}) : l'export est écrit en Markdown dans out/linear-export/. Rien n'est envoyé.`}
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
  return <div className="h-36 w-full shrink-0 animate-pulse rounded-xl border bg-muted/40 xl:w-80" />;
}
