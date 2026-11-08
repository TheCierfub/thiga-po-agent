"use client";

import { useState, useTransition } from "react";
import { InboxIcon, Loader2Icon, RotateCcwIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { sendToOutbox } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Channel } from "@/core/schemas";
import { CHANNEL_LABEL, REPLY_LABEL } from "@/lib/etai/labels";
import { useBatchView } from "@/lib/etai/overrides";
import { cn } from "@/lib/utils";
import { Empty, FeedbackRef } from "./bits";

type Edit = { subject: string | null; body: string };

export function RecontactBoard() {
  const view = useBatchView();
  const drafts = view.drafts;
  const [selected, setSelected] = useState(drafts[0]?.feedbackId ?? null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [sent, setSent] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (drafts.length === 0) return <Empty>Personne à recontacter sur ce lot.</Empty>;
  const draft = drafts.find((d) => d.feedbackId === selected) ?? drafts[0]!;
  const edit = edits[draft.feedbackId] ?? { subject: draft.subject, body: draft.body };
  const modified = edit.body !== draft.body || edit.subject !== draft.subject;
  const update = (patch: Partial<Edit>) => setEdits((e) => ({ ...e, [draft.feedbackId]: { ...edit, ...patch } }));

  function send() {
    start(async () => {
      const result = await sendToOutbox({ batch: view.batch, feedbackId: draft.feedbackId, subject: edit.subject, body: edit.body });
      setConfirming(false);
      if (!result.ok) {
        toast.error("Dépôt impossible", { description: result.message });
        return;
      }
      setSent((s) => ({ ...s, [draft.feedbackId]: result.file }));
      toast.success("Déposé dans la boîte de test", { description: `${result.file} · rien n'a été envoyé au client.` });
    });
  }

  return (
    <div className="grid gap-6 animate-enter lg:grid-cols-[18rem_minmax(0,1fr)]" style={{ "--i": 1 } as React.CSSProperties}>
      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:overflow-visible">
        {drafts.map((d) => (
          <li key={d.feedbackId} className="w-64 shrink-0 lg:w-auto">
            <button
              type="button"
              onClick={() => setSelected(d.feedbackId)}
              aria-current={d.feedbackId === draft.feedbackId}
              className={cn(
                "w-full rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150 ease-(--ease-out) active:scale-[0.98]",
                d.feedbackId === draft.feedbackId ? "border-foreground/30 bg-muted/60" : "hover:bg-muted/40",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="min-w-0 flex-1 truncate">{d.recipient}</span>
                {sent[d.feedbackId] ? <InboxIcon className="size-3.5 text-emerald-600" aria-label="Déposé" /> : null}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {d.kind === "investigation" ? "Investigation" : "Identifiant de compte"} · {CHANNEL_LABEL[d.channel as Channel] ?? d.channel}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="min-w-0 space-y-5 rounded-xl border bg-card p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{REPLY_LABEL[draft.replyMode]}</span>
            <span>à {draft.recipient}</span>
            <span>{draft.accountKnown ? "compte connu" : "compte inconnu"}</span>
            <FeedbackRef batch={view.batch} id={draft.feedbackId} className="ml-auto" />
          </div>
          <p className="text-sm">{draft.reason}</p>
        </div>

        <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
          {draft.excerpt}
          {draft.excerpt.length >= 280 ? "…" : ""}
        </blockquote>

        {draft.questions.length > 0 ? (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ce qu&apos;on cherche à savoir</h3>
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {draft.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {edit.subject !== null ? (
          <div className="space-y-1.5">
            <Label htmlFor="subject">Objet</Label>
            <Input id="subject" value={edit.subject} onChange={(e) => update({ subject: e.target.value })} />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="body">Message</Label>
          <Textarea id="body" value={edit.body} onChange={(e) => update({ body: e.target.value })} rows={12} className="font-[inherit] leading-relaxed" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setConfirming(true)} disabled={pending || edit.body.trim().length === 0}>
            <SendIcon data-icon="inline-start" /> Envoyer
          </Button>
          {modified ? (
            <Button
              variant="ghost"
              onClick={() =>
                setEdits((e) => {
                  const next = { ...e };
                  delete next[draft.feedbackId];
                  return next;
                })
              }
            >
              <RotateCcwIcon data-icon="inline-start" /> Revenir au brouillon
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {sent[draft.feedbackId] ? `Déposé : ${sent[draft.feedbackId]}` : "Mode démo : rien ne part, le message va dans out/outbox/."}
          </span>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Déposer dans la boîte de test ?</DialogTitle>
            <DialogDescription>
              Le message pour {draft.recipient} sera écrit dans out/outbox/. Il ne sera envoyé à personne : l&apos;envoi réel, par{" "}
              {REPLY_LABEL[draft.replyMode].toLowerCase()}, reste une action manuelle de votre part.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button onClick={send} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <InboxIcon data-icon="inline-start" />}
              Déposer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
