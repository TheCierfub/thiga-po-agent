"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { generateThemeStory, saveThemeStory } from "@/app/actions";
import { ExportPanel } from "@/components/etai/export-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SIZES, type UserStoryDraft } from "@/core/schemas";
import { formatUsd } from "@/core/pipeline/ingest-trace";
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
  points,
}: {
  batch: DemoBatch;
  themeKey: string;
  initialStory: UserStoryDraft | null;
  live: boolean;
  mode: ExportMode;
  existingIssueId: string | null;
  points: Record<UserStoryDraft["size"], number>;
}) {
  const router = useRouter();
  const { overrides } = useOverrides();
  const [story, setStory] = useState<UserStoryDraft | null>(initialStory);
  const latest = useRef(story);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function patch(partial: Partial<UserStoryDraft>) {
    setStory((current) => {
      if (!current) return current;
      const next = { ...current, ...partial, editedByPo: true as const };
      latest.current = next;
      return next;
    });
  }

  function save(next: UserStoryDraft | null) {
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
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      <div className="space-y-1.5">
        <Label htmlFor="story-title">Titre</Label>
        <Input id="story-title" value={story.title} onChange={(event) => patch({ title: event.target.value })} onBlur={() => save(latest.current)} />
      </div>
      <div className="grid gap-3">
        <Field label="En tant que" value={story.asA} onChange={(asA) => patch({ asA })} onBlur={() => save(latest.current)} />
        <Field label="Je veux" value={story.iWant} onChange={(iWant) => patch({ iWant })} onBlur={() => save(latest.current)} />
        <Field label="Afin que" value={story.soThat} onChange={(soThat) => patch({ soThat })} onBlur={() => save(latest.current)} />
      </div>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Critères d’acceptation</h3>
        {story.acceptanceCriteria.map((criterion, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-dashed p-3">
            <Field label="Étant donné" value={criterion.given} onChange={(given) => patchCriterion(story, index, { given }, patch)} onBlur={() => save(latest.current)} />
            <Field label="Quand" value={criterion.when} onChange={(when) => patchCriterion(story, index, { when }, patch)} onBlur={() => save(latest.current)} />
            <Field label="Alors" value={criterion.then} onChange={(then) => patchCriterion(story, index, { then }, patch)} onBlur={() => save(latest.current)} />
          </div>
        ))}
      </div>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="story-size">Complexité relative</Label>
        <Select
          value={story.size}
          onValueChange={(value) => {
            const size = value as UserStoryDraft["size"];
            const next = { ...story, size, editedByPo: true as const };
            latest.current = next;
            setStory(next);
            save(next);
          }}
        >
          <SelectTrigger id="story-size" className="w-full font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIZES.map((size) => (
              <SelectItem key={size} value={size} className="font-mono">
                {size} · {points[size]} pt
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{story.sizeRationale}</p>
      </div>
      <div className="border-t pt-4">
        <ExportPanel batch={batch} themeKey={themeKey} hasStory existingIssueId={existingIssueId} mode={mode} story={story} />
      </div>
      <Button type="button" variant="outline" onClick={generate} disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
        Régénérer
      </Button>
      {error ? <p className="text-sm text-warn-fg">{error}</p> : null}
    </div>
  );
}

function Field({ label, value, onChange, onBlur }: { label: string; value: string; onChange: (value: string) => void; onBlur: () => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className="min-h-16" />
    </div>
  );
}

function patchCriterion(
  story: UserStoryDraft,
  index: number,
  partial: Partial<UserStoryDraft["acceptanceCriteria"][number]>,
  patch: (partial: Partial<UserStoryDraft>) => void,
) {
  patch({
    acceptanceCriteria: story.acceptanceCriteria.map((criterion, item) => (item === index ? { ...criterion, ...partial } : criterion)),
  });
}
