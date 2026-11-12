"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addFeedback, type AddFeedbackOutcome } from "@/app/actions";
import { SignInLink } from "@/components/etai/sign-in-link";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STEP_LABEL, formatUsd, type IngestCall, type IngestStep } from "@/core/pipeline/ingest-trace";
import { CHANNEL_LABEL } from "@/lib/etai/labels";
import { CHANNELS, type Channel } from "@/core/schemas";

const SOURCE_ORDER: Channel[] = ["email", "ticket_support", "forum_produit", ...CHANNELS.filter((channel) => !["email", "ticket_support", "forum_produit"].includes(channel))];

export function AddFeedbackForm({
  accounts,
  live,
  detail,
  profile = "B",
  canSpend,
  returnPath,
}: {
  accounts: { id: string; nom: string }[];
  live: boolean;
  detail: string;
  canSpend: boolean;
  returnPath: string;
  profile?: string;
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
        setAuthorName("");
        setAccountId("none");
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
          <Select
            items={Object.fromEntries(SOURCE_ORDER.map((item) => [item, CHANNEL_LABEL[item]]))}
            value={channel}
            onValueChange={(value) => setChannel(value as Channel)}
            disabled={!live || pending}
          >
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
          <Select
            items={{ none: "Non indiqué", ...Object.fromEntries(accounts.map((account) => [account.id, account.nom])) }}
            value={accountId}
            onValueChange={(value) => setAccountId(value ?? "none")}
            disabled={!live || pending}
          >
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
          <Select
            items={{ fr: "Français", en: "Anglais" }}
            value={language}
            onValueChange={(value) => setLanguage(value as "fr" | "en")}
            disabled={!live || pending}
          >
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
        {canSpend ? (
          <Button type="submit" disabled={!live || pending || text.trim().length === 0}>
            {pending ? `Analyse en cours · ${elapsed.toFixed(1)} s` : "Analyser et enregistrer"}
          </Button>
        ) : (
          <SignInLink href={`/acces?next=${returnPath}`}>Code d&apos;accès requis</SignInLink>
        )}
        {pending ? (
          <p className="text-sm text-muted-foreground">
            {profile === "B"
              ? "Jev choisit le thème, puis le RICE est recalculé. Sonnet n'est appelé que si le rattachement n'est pas sûr."
              : "Classification, rattachement au thème, puis recalcul du RICE."}
          </p>
        ) : null}
        {!live ? <p className="text-sm text-warn-fg">{detail}</p> : null}
      </div>
      {outcome && !pending ? <IngestReport outcome={outcome} /> : null}
    </form>
  );
}

function IngestReport({ outcome }: { outcome: AddFeedbackOutcome }) {
  if (!outcome.ok) return <p className="text-sm text-warn-fg">{outcome.message}</p>;
  const { trace } = outcome;
  return (
    <div role="status" className="space-y-2 text-sm">
      <p>
        Traité en {(outcome.elapsedMs / 1000).toFixed(1)} s.
        {trace.decision?.attached
          ? ` Rattaché par ${/jev|decisions/i.test(trace.decision.engine) ? "Jev" : trace.decision.engine}, confiance ${
              trace.decision.confidence === null ? "inconnue" : trace.decision.confidence.toFixed(2).replace(".", ",")
            }.`
          : ""}
      </p>
      {trace.themes.length === 0 ? <p>Aucun thème touché (quarantaine ou hors sujet).</p> : null}
      <ul className="space-y-1">
        {trace.themes.map((theme) => (
          <li key={theme.key}>
            {theme.created ? "Nouveau thème" : "Thème existant"} « {theme.title} ». RICE{" "}
            {theme.riceBefore === null ? "—" : theme.riceBefore.toFixed(2)} → {theme.riceAfter.toFixed(2)}. MoSCoW{" "}
            {theme.moscowBefore ?? "—"} → {theme.moscowAfter}.
            {theme.relatedThemeIds.length > 0 ? ` Lié à ${theme.relatedThemeIds.join(", ")}.` : ""}
            {theme.rationale ? ` ${theme.rationale}` : ""}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        {trace.steps.map((step) => `${STEP_LABEL[step.name] ?? step.name} ${stepLabel(step)}`).join(" · ")}
        {" · "}
        {trace.costUsd === null ? "coût non communiqué" : `coût estimé ${formatUsd(trace.costUsd)}`}
      </p>
      <Collapsible>
        <CollapsibleTrigger className="text-sm text-muted-foreground underline-offset-4 hover:underline">Trace</CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          {trace.decision?.engine ? <p>Moteur de décision : {trace.decision.engine}</p> : null}
          {trace.calls.length === 0 ? <p>Aucun appel de modèle.</p> : null}
          <ul className="space-y-1">
            {trace.calls.map((call, index) => (
              <li key={`${call.task}-${call.key}-${index}`}>{formatCall(call)}</li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function stepLabel(step: IngestStep): string {
  return step.durationMs === 0 ? "sautée" : `${(step.durationMs / 1000).toFixed(1)} s`;
}

function formatCall(call: IngestCall): string {
  const tokens = (value: number | null) => (value === null ? "—" : String(value));
  const cost = call.costUsd === null ? "coût —" : formatUsd(call.costUsd);
  const who = call.key ? `${call.task} / ${call.key}` : call.task;
  return `${who} · ${(call.durationMs / 1000).toFixed(1)} s · entrée ${tokens(call.promptTokens)} · sortie ${tokens(call.completionTokens)} · raisonnement ${tokens(call.reasoningTokens)} · ${cost}`;
}
