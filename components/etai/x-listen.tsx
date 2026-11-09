"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pollXMentions, type PollXOutcome } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUsd, STEP_LABEL, type IngestStep } from "@/core/pipeline/ingest-trace";
import {
  MAX_LOOKBACK_HOURS,
  SESSION_LIMIT_MS,
  capMicro,
  formatDelay,
  listenGate,
} from "@/core/sources/x-listen";

type Pass = Extract<PollXOutcome, { ok: true }> & { at: string };

export function XListen({
  enabled,
  live,
  detail,
  query,
  pollSeconds,
  maxSessionUsd,
}: {
  enabled: boolean;
  live: boolean;
  detail: string;
  query: string;
  pollSeconds: number;
  maxSessionUsd: number;
}) {
  const router = useRouter();
  const startedAt = useRef<number | null>(null);
  const activatedAt = useRef<string | null>(null);
  const spent = useRef(0);
  const inFlight = useRef(false);
  const lookback = useRef(0);
  const [paused, setPaused] = useState(false);
  const [stop, setStop] = useState<null | "duree" | "cout" | "erreur">(null);
  const [pending, setPending] = useState(false);
  const [lastPoll, setLastPoll] = useState<string | null>(null);
  const [spentMicro, setSpentMicro] = useState(0);
  const [lookbackHours, setLookbackHours] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);

  useEffect(() => {
    lookback.current = lookbackHours;
  }, [lookbackHours]);

  const blocked = !enabled || !live;
  const listening = !blocked && !paused && stop === null;

  useEffect(() => {
    if (blocked || paused || stop) return;
    if (startedAt.current === null) {
      startedAt.current = Date.now();
      activatedAt.current = new Date(startedAt.current).toISOString();
    }
    const started = startedAt.current;
    const activated = activatedAt.current ?? new Date(started).toISOString();
    let cancel = false;
    const tick = async () => {
      const gate = listenGate({
        inFlight: inFlight.current,
        paused: false,
        startedAt: started,
        now: Date.now(),
        spentMicro: spent.current,
        capMicro: capMicro(maxSessionUsd),
      });
      if (gate.stop) {
        setStop(gate.stop);
        return;
      }
      if (!gate.poll) return;
      inFlight.current = true;
      setPending(true);
      try {
        const result = await pollXMentions({
          activatedAt: activated,
          lookbackHours: lookback.current,
          spentMicro: spent.current,
        });
        if (cancel) return;
        setLastPoll(new Date().toISOString());
        if (!result.ok) {
          setMessage(result.message);
          if (result.stop) setStop("erreur");
          return;
        }
        spent.current = result.spentMicro;
        setSpentMicro(result.spentMicro);
        setMessage(result.errors[0] ?? null);
        setPasses((items) => [{ ...result, at: new Date().toISOString() }, ...items].slice(0, 12));
        if (result.created.length > 0) router.refresh();
        if (result.stop) setStop(result.stop);
      } finally {
        inFlight.current = false;
        if (!cancel) setPending(false);
      }
    };
    void tick();
    const interval = window.setInterval(() => void tick(), pollSeconds * 1000);
    const remaining = SESSION_LIMIT_MS - (Date.now() - started);
    const timeout = window.setTimeout(() => setStop((current) => current ?? "duree"), Math.max(0, remaining));
    return () => {
      cancel = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [blocked, paused, stop, pollSeconds, maxSessionUsd, router]);

  const status = blocked
    ? "Écoute indisponible"
    : stop === "duree"
      ? "Écoute arrêtée après 30 minutes"
      : stop === "cout"
        ? "Écoute arrêtée : plafond de session atteint"
        : stop === "erreur"
          ? "Écoute arrêtée"
          : paused
            ? "Écoute en pause"
            : pending
              ? "Passage en cours"
              : "Écoute active";

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <span className={listening ? "size-2 rounded-full bg-ok-fg" : "size-2 rounded-full bg-muted-foreground"} aria-hidden />
            {status}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tant que cette page reste ouverte, elle interroge X toutes les {pollSeconds} s. Fermer la page arrête l’écoute. Les posts déjà vus ne sont pas repris.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={blocked || stop !== null} onClick={() => setPaused((value) => !value)}>
          {paused ? "Reprendre" : "Pause"}
        </Button>
      </div>
      <p className="font-mono text-xs text-muted-foreground">{query}</p>
      <p className="text-sm text-muted-foreground">
        {lastPoll
          ? `Dernier passage à ${new Date(lastPoll).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Paris" })}.`
          : "Aucun passage encore."}{" "}
        Coût de la session {formatUsd(spentMicro / 1_000_000)} / {formatUsd(maxSessionUsd)}.
      </p>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="x-lookback">Plan B : inclure les dernières heures</Label>
        <Input
          id="x-lookback"
          type="number"
          min={0}
          max={MAX_LOOKBACK_HOURS}
          step={1}
          value={lookbackHours}
          onChange={(event) => setLookbackHours(Math.min(MAX_LOOKBACK_HOURS, Math.max(0, Number(event.target.value) || 0)))}
          disabled={blocked || stop !== null}
        />
        <p className="text-xs text-muted-foreground">
          0 ne prend que les posts publiés après l’ouverture de cette page, moins 2 minutes. Une autre valeur est prise au prochain passage.
        </p>
      </div>
      {blocked ? <p className="text-sm text-warn-fg">{enabled ? detail : "TREG_TOKEN est absent : l’écoute X est désactivée."}</p> : null}
      {message ? <p className="text-sm text-warn-fg">{message}</p> : null}
      <Collapsible>
        <CollapsibleTrigger className="text-sm text-muted-foreground underline-offset-4 hover:underline">Trace</CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          {passes.length === 0 ? <p>Aucun passage pour l’instant.</p> : null}
          {passes.map((pass) => (
            <div key={pass.at} className="space-y-1">
              <p>
                {new Date(pass.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Paris" })}
                {" · "}
                {pass.found} vu{pass.found > 1 ? "s" : ""}, {pass.created.length} nouveau{pass.created.length > 1 ? "x" : ""}, {pass.ignored} ignoré{pass.ignored > 1 ? "s" : ""}
                {" · "}
                {pass.treg.servedBy ?? "fournisseur inconnu"} · {pass.treg.callId ?? "sans identifiant"} ·{" "}
                {pass.treg.costMicro === null ? "coût non communiqué" : formatUsd(pass.treg.costMicro / 1_000_000)}
              </p>
              {pass.created.map((post) => (
                <div key={post.feedbackId}>
                  <p>
                    {post.handle ?? post.feedbackId} · indexation {formatDelay(post.indexDelayMs)} · traitement {formatDelay(post.processDelayMs)}
                    {post.quarantined ? " · quarantaine" : ""}
                  </p>
                  {post.trace.themes.map((theme) => (
                    <p key={theme.key}>
                      {theme.created ? "Nouveau thème" : "Thème existant"} « {theme.title} ». RICE {theme.riceBefore === null ? "—" : theme.riceBefore.toFixed(2)} → {theme.riceAfter.toFixed(2)}. MoSCoW {theme.moscowBefore ?? "—"} → {theme.moscowAfter}.
                    </p>
                  ))}
                  <p>
                    {post.trace.steps.map((step) => `${STEP_LABEL[step.name] ?? step.name} ${stepLabel(step)}`).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function stepLabel(step: IngestStep): string {
  return step.durationMs === 0 ? "sautée" : `${(step.durationMs / 1000).toFixed(1)} s`;
}
