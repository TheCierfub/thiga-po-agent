"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addFeedback, type AddFeedbackOutcome } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_LABEL, num } from "@/lib/etai/labels";
import { CHANNELS, type Channel } from "@/core/schemas";

const SOURCE_ORDER: Channel[] = ["email", "ticket_support", "forum_produit", ...CHANNELS.filter((channel) => !["email", "ticket_support", "forum_produit"].includes(channel))];

export function AddFeedbackForm({
  accounts,
  live,
  detail,
}: {
  accounts: { id: string; nom: string }[];
  live: boolean;
  detail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<Channel>("email");
  const [accountId, setAccountId] = useState("none");
  const [authorName, setAuthorName] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [text, setText] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [outcome, setOutcome] = useState<AddFeedbackOutcome | null>(null);

  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [pending]);

  const elapsed = startedAt && pending ? Math.max(0, (now - startedAt) / 1000) : 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!live || pending) return;
    setOutcome(null);
    const mark = Date.now();
    setStartedAt(mark);
    setNow(mark);
    startTransition(async () => {
      const result = await addFeedback({
        channel,
        sourceAccountId: accountId === "none" ? null : accountId,
        authorName: authorName.trim() || null,
        language,
        text,
      });
      setOutcome(result);
      setStartedAt(null);
      if (result.ok) {
        setText("");
        router.push(`/jeudi/feedbacks#${result.feedbackId}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">Ajouter un feedback</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Collez un e-mail, un ticket ou un commentaire. En mode direct, seul ce texte part au modèle : il est rattaché à un thème,
          enregistré, et le classement est recalculé. Le lot lundi ne bouge pas.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="feedback-source">Source</Label>
          <Select value={channel} onValueChange={(value) => setChannel(value as Channel)} disabled={!live || pending}>
            <SelectTrigger id="feedback-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_ORDER.map((item) => (
                <SelectItem key={item} value={item}>
                  {CHANNEL_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feedback-account">Compte client</Label>
          <Select value={accountId} onValueChange={(value) => setAccountId(value ?? "none")} disabled={!live || pending}>
            <SelectTrigger id="feedback-account" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Non indiqué</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feedback-author">Auteur</Label>
          <Input
            id="feedback-author"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="Nom, facultatif"
            maxLength={120}
            disabled={!live || pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feedback-language">Langue</Label>
          <Select value={language} onValueChange={(value) => setLanguage(value as "fr" | "en")} disabled={!live || pending}>
            <SelectTrigger id="feedback-language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="en">Anglais</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feedback-text">Texte</Label>
        <Textarea
          id="feedback-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Collez le message tel qu'il est arrivé."
          required
          minLength={1}
          maxLength={8000}
          disabled={!live || pending}
          className="min-h-36"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!live || pending || text.trim().length === 0}>
          {pending ? `Analyse en cours · ${elapsed.toFixed(1)} s` : "Analyser et enregistrer"}
        </Button>
        {pending ? (
          <p className="text-sm text-muted-foreground">Classification, rattachement au thème, puis recalcul du RICE.</p>
        ) : null}
        {!live ? <p className="text-sm text-warn-fg">{detail}</p> : null}
      </div>
      {outcome && !pending ? (
        <p role="status" className={outcome.ok ? "text-sm text-foreground" : "text-sm text-warn-fg"}>
          {outcome.ok ? summary(outcome) : outcome.message}
        </p>
      ) : null}
    </form>
  );
}

function summary(outcome: Extract<AddFeedbackOutcome, { ok: true }>): string {
  const seconds = (outcome.elapsedMs / 1000).toFixed(1);
  if (!outcome.themeTitle) return `Enregistré en ${seconds} s, sans thème (quarantaine ou hors sujet).`;
  const where = outcome.createdTheme ? `nouveau thème « ${outcome.themeTitle} »` : `thème « ${outcome.themeTitle} »`;
  const rice =
    outcome.riceBefore !== null && outcome.riceAfter !== null
      ? ` RICE ${num(outcome.riceBefore, 2)} → ${num(outcome.riceAfter, 2)}.`
      : "";
  const moscow =
    outcome.moscowBefore && outcome.moscowAfter && outcome.moscowBefore !== outcome.moscowAfter
      ? ` MoSCoW ${outcome.moscowBefore} → ${outcome.moscowAfter}.`
      : "";
  return `Traité en ${seconds} s, rattaché au ${where}.${rice}${moscow}`;
}
