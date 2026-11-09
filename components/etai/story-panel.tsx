"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { generateThemeStory, saveThemeStory } from "@/app/actions";
import { ExportPanel } from "@/components/etai/export-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { UserStoryDraft } from "@/core/schemas";
import { formatUsd } from "@/core/pipeline/ingest-trace";
import { storyIssueSize, storyIssueTitle, storyText } from "@/core/stories/text";
import type { DemoBatch } from "@/lib/etai/batches";
import type { ExportMode } from "@/lib/etai/export-mode";
import { useOverrides } from "@/lib/etai/overrides";

export function StoryPanel({
  batch,
  themeKey,
  initialStory,
  live,
  mode,
  existingIssueId,
}: {
  batch: DemoBatch;
  themeKey: string;
  initialStory: UserStoryDraft | null;
  live: boolean;
  mode: ExportMode;
  existingIssueId: string | null;
}) {
  const router = useRouter();
  const { overrides } = useOverrides();
  const [story, setStory] = useState<UserStoryDraft | null>(initialStory);
  const latest = useRef(story);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function edit(text: string) {
    setStory((current) => {
      if (!current) return current;
      const next = { ...current, text, editedByPo: true as const };
      const titled = { ...next, title: storyIssueTitle(next), size: storyIssueSize(next) };
      latest.current = titled;
      return titled;
    });
  }

  function save() {
    const next = latest.current;
    if (!live || !next) return;
    void saveThemeStory({ batch, story: next }).then((result) => {
      if (!result.ok) toast.error("Story non enregistrée", { description: result.message });
    });
  }

  function generate() {
    setError(null);
    setNote(null);
    start(async () => {
      const result = await generateThemeStory({ batch, themeKey, overrides });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      latest.current = result.story;
      setStory(result.story);
      const cost = result.costUsd === null ? "réponse rejouée" : `coût estimé ${formatUsd(result.costUsd)}`;
      setNote(`Rédigée en ${(result.elapsedMs / 1000).toFixed(1)} s · ${cost}${result.persisted ? "" : " · non enregistrée hors mode direct"}`);
      router.refresh();
    });
  }

  if (!story) {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">Aucune story pour ce thème. La rédaction part des feedbacks du thème, avec les citations déjà vérifiées.</p>
        <Button type="button" onClick={generate} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {pending ? "Rédaction en cours" : "Générer la user story"}
        </Button>
        {error ? <p className="text-sm text-warn-fg">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      <div className="space-y-1.5">
        <Label htmlFor="story-text">Texte envoyé à Linear</Label>
        <Textarea
          id="story-text"
          value={storyText(story)}
          onChange={(event) => edit(event.target.value)}
          onBlur={save}
          className="min-h-80 font-sans text-sm leading-relaxed"
        />
      </div>
      <div className="border-t pt-4">
        <ExportPanel batch={batch} themeKey={themeKey} hasStory existingIssueId={existingIssueId} mode={mode} story={story} />
      </div>
      {error ? <p className="text-sm text-warn-fg">{error}</p> : null}
    </div>
  );
}
