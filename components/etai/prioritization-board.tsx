"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDownIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { CONFIDENCE_RULE } from "@/core/scoring/rice";
import { FORCEABLE_CLASSES, type ForceableClass } from "@/core/scoring/overrides";
import { SIZES, type MoscowDecision, type RiceScore, type Size, type Theme, type ThemeAssessment } from "@/core/schemas";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CHANNEL_LABEL, CONSTRAINT_LABEL, MOSCOW_ORDER, eur, num, pct } from "@/lib/etai/labels";
import { useOverrides, usePrioritization } from "@/lib/etai/overrides";
import type { BatchView } from "@/lib/etai/view";
import { cn } from "@/lib/utils";
import type { Channel } from "@/core/schemas";
import { CapacityBar } from "./capacity-bar";
import { FeedbackRef, MoscowBadge, TrendBars } from "./bits";

export function PrioritizationBoard() {
  const { overrides, active, reset, view } = useOverrides();
  const { allocation, riceByKey, decisionByKey } = usePrioritization();
  const [forcing, setForcing] = useState<Theme | null>(null);
  const original = new Map(view.state.rice.map((r) => [r.themeKey, r]));
  const originalDecision = new Map(view.state.allocation.decisions.map((d) => [d.themeKey, d]));
  const assessments = new Map(view.state.assessments.map((a) => [a.themeKey, a]));
  const themes = [...view.state.themes].sort(
    (a, b) =>
      MOSCOW_ORDER.indexOf(decisionByKey.get(a.key)!.moscow) - MOSCOW_ORDER.indexOf(decisionByKey.get(b.key)!.moscow) ||
      riceByKey.get(b.key)!.score - riceByKey.get(a.key)!.score,
  );
  const count = Object.keys(overrides.effort).length + Object.keys(overrides.forced).length;

  return (
    <div className="space-y-4">
      <div className="animate-enter" style={{ "--i": 1 } as React.CSSProperties}>
        <CapacityBar allocation={allocation} strategy={view.strategy} />
      </div>
      {allocation.alerts.map((a) => (
        <div key={a.code} className="flex gap-2 rounded-xl border border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn-fg animate-enter">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p>{a.message}</p>
        </div>
      ))}
      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--moscow-should)/30 bg-[color-mix(in_oklch,var(--moscow-should)_6%,transparent)] px-4 py-2.5 text-sm animate-enter">
          <span>
            {count} arbitrage{count > 1 ? "s" : ""} du PO appliqué{count > 1 ? "s" : ""} sur ce lot. Les exports vers le backlog en tiennent compte.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              toast("Arbitrages annulés", { description: "Retour au classement calculé par l'agent." });
            }}
          >
            <RotateCcwIcon data-icon="inline-start" /> Tout annuler
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border animate-enter" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6rem_6.5rem_5rem_8.5rem_2rem] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
          <span>Thème</span>
          <span>Reach</span>
          <span>Impact</span>
          <span>Confidence</span>
          <span>Effort</span>
          <span className="text-right">RICE</span>
          <span>MoSCoW</span>
          <span />
        </div>
        <ul className="divide-y">
          {themes.map((t) => (
            <ThemeRow
              key={t.key}
              batch={view.batch}
              view={view}
              theme={t}
              rice={riceByKey.get(t.key)!}
              baseRice={original.get(t.key)!}
              decision={decisionByKey.get(t.key)!}
              baseDecision={originalDecision.get(t.key)!}
              assessment={assessments.get(t.key)}
              forcedMotif={overrides.forced[t.key]?.motif ?? null}
              onForce={() => setForcing(t)}
            />
          ))}
        </ul>
      </div>

      <ForceDialog theme={forcing} current={forcing ? decisionByKey.get(forcing.key)! : null} onClose={() => setForcing(null)} />
    </div>
  );
}

function ThemeRow({
  batch,
  view,
  theme,
  rice,
  baseRice,
  decision,
  baseDecision,
  assessment,
  forcedMotif,
  onForce,
}: {
  batch: string;
  view: BatchView;
  theme: Theme;
  rice: RiceScore;
  baseRice: RiceScore;
  decision: MoscowDecision;
  baseDecision: MoscowDecision;
  assessment: ThemeAssessment | undefined;
  forcedMotif: string | null;
  onForce: () => void;
}) {
  const { setEffort, unforce } = useOverrides();
  const scoreChanged = rice.score !== baseRice.score;
  const classChanged = decision.moscow !== baseDecision.moscow;
  const committed = decision.moscow === "Hors arbitrage";

  return (
    <Collapsible render={<li />} className="group/row">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6rem_6.5rem_5rem_8.5rem_2rem]">
        <div className="min-w-0">
          <Link href={`/${batch}/themes/${theme.key}`} className="text-sm font-medium hover:underline">
            {theme.title}
          </Link>
          <p className={cn("mt-0.5 text-xs text-muted-foreground", decision.moscow === "Won't" && "text-foreground/70")}>
            {decision.moscow === "Won't" ? <span className="font-medium">Pourquoi Won&apos;t : </span> : null}
            {decision.reason}
          </p>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <MoscowBadge value={decision.moscow} forced={forcedMotif !== null} />
        </div>

        <dl className="col-span-2 grid grid-cols-4 gap-3 text-sm lg:contents">
          <Cell label="Reach">
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help tabular-nums underline decoration-dotted underline-offset-4" />}>
                {rice.reach.value} compte{rice.reach.value > 1 ? "s" : ""}
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                {rice.reach.accounts.map((id) => view.accounts[id]?.nom ?? id).join(", ") || "Aucun compte rattaché"} · {rice.reach.messages} message(s)
              </TooltipContent>
            </Tooltip>
          </Cell>
          <Cell label="Impact">
            <span className="tabular-nums">{num(rice.impact.value)}</span>
          </Cell>
          <Cell label="Confidence">
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help tabular-nums underline decoration-dotted underline-offset-4" />}>
                {pct(rice.confidence.value)}
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{rice.confidence.rule}</TooltipContent>
            </Tooltip>
          </Cell>
          <Cell label="Effort">
            {committed ? (
              <span className="text-muted-foreground">{rice.effort.size}</span>
            ) : (
              <Select
                value={rice.effort.size}
                onValueChange={(value) => {
                  const size = value as Size;
                  setEffort(theme.key, size === baseRice.effort.size ? null : size);
                }}
              >
                <SelectTrigger size="sm" aria-label={`Effort de ${theme.title}`} className={cn("w-[5.5rem] font-mono", rice.effort.source === "po" && "border-(--moscow-should)/50")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono">
                      {s} · {view.strategy.sizePoints[s]} pt
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Cell>
        </dl>

        <div className="hidden text-right font-mono text-sm tabular-nums lg:block">
          <span key={rice.score} className={cn("rounded px-1", scoreChanged && "animate-flash bg-[color-mix(in_oklch,var(--moscow-should)_8%,transparent)]")}>
            {num(rice.score, 2)}
          </span>
        </div>
        <div className="hidden items-center gap-1 lg:flex">
          <span key={decision.moscow} className={cn("rounded", classChanged && "animate-flash")}>
            <MoscowBadge value={decision.moscow} forced={forcedMotif !== null} />
          </span>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-2 lg:col-span-1 lg:justify-end">
          <span className="font-mono text-sm tabular-nums lg:hidden">RICE {num(rice.score, 2)}</span>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`Détail du calcul pour ${theme.title}`} />}
          >
            <ChevronDownIcon className="transition-transform duration-200 ease-(--ease-out) group-data-[open]/row:rotate-180" />
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-(--ease-out) data-ending-style:h-0 data-starting-style:h-0">
        <Detail view={view} theme={theme} rice={rice} decision={decision} assessment={assessment} />
        {!committed ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-dashed bg-muted/20 px-4 py-3 text-sm">
            {forcedMotif !== null ? (
              <>
                <span className="text-muted-foreground">Catégorie forcée par le PO : « {forcedMotif} ».</span>
                <Button variant="outline" size="sm" onClick={() => unforce(theme.key)}>
                  Rendre la main au calcul
                </Button>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">Le classement ne vous convient pas ?</span>
                <Button variant="outline" size="sm" onClick={onForce}>
                  Forcer une catégorie MoSCoW
                </Button>
              </>
            )}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground lg:sr-only">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Detail({
  view,
  theme,
  rice,
  decision,
  assessment,
}: {
  view: BatchView;
  theme: Theme;
  rice: RiceScore;
  decision: MoscowDecision;
  assessment: ThemeAssessment | undefined;
}) {
  const okr = view.strategy.okrs.find((o) => o.id === assessment?.okrId);
  const ref = view.strategy.referenceStories.find((s) => s.id === assessment?.referenceStoryId);
  return (
    <div className="grid gap-6 bg-muted/20 px-4 py-4 text-sm md:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reach · comptes distincts</h3>
        <ul className="space-y-1">
          {rice.reach.accounts.map((id) => {
            const a = view.accounts[id];
            return (
              <li key={id} className="flex justify-between gap-2">
                <span>{a?.nom ?? id}</span>
                <span className="text-xs text-muted-foreground">
                  {a ? `${a.offre} · ${eur(a.arr)}` : ""}
                </span>
              </li>
            );
          })}
          {rice.reach.accounts.length === 0 ? <li className="text-muted-foreground">Aucun compte rattaché avec certitude.</li> : null}
        </ul>
        <p className="text-xs text-muted-foreground">
          {rice.reach.messages} message(s) du {new Date(rice.reach.window.start).toLocaleDateString("fr-FR")} au{" "}
          {new Date(rice.reach.window.end).toLocaleDateString("fr-FR")}. Un compte compte une fois, même s&apos;il écrit souvent.
        </p>
        {rice.reach.excluded.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {rice.reach.excluded.map((x) => (
              <li key={x.feedbackId}>
                Exclu <FeedbackRef batch={view.batch} id={x.feedbackId} /> : {x.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confidence · règle fixe</h3>
        <p>{rice.confidence.rule}.</p>
        <p className="text-xs text-muted-foreground">
          Canaux : {rice.confidence.channels.map((c) => CHANNEL_LABEL[c as Channel] ?? c).join(", ") || "aucun"}.
        </p>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>100 % : au moins {CONFIDENCE_RULE.full.minAccounts} comptes et {CONFIDENCE_RULE.full.minChannels} canaux</li>
          <li>80 % : au moins {CONFIDENCE_RULE.medium.minAccounts} comptes</li>
          <li>50 % : sinon (preuve étroite)</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Effort · taille t-shirt</h3>
        <p>
          {rice.effort.size} = {rice.effort.points} pt{" "}
          <span className="text-muted-foreground">({rice.effort.source === "po" ? "modifié par le PO" : "proposé par le LLM"})</span>
        </p>
        {assessment ? (
          <p className="text-xs text-muted-foreground">
            {ref ? `Comparé à « ${ref.title} » (${ref.size}). ` : null}
            {assessment.effortRationale}
          </p>
        ) : null}
        <table className="w-full text-xs">
          <tbody>
            {SIZES.map((s) => (
              <tr key={s} className={cn(s === rice.effort.size ? "font-medium text-foreground" : "text-muted-foreground")}>
                <td className="py-0.5 pr-2 font-mono">{s}</td>
                <td className="py-0.5 pr-2 font-mono whitespace-nowrap tabular-nums">{view.strategy.sizePoints[s]} pt</td>
                <td className="py-0.5">{view.strategy.referenceStories.filter((r) => r.size === s).map((r) => r.title).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Impact et calcul</h3>
        <p>
          Impact {num(rice.impact.value)}
          {okr ? <span className="text-muted-foreground"> · {okr.title}</span> : null}
        </p>
        {assessment ? <p className="text-xs text-muted-foreground">{assessment.impactRationale}</p> : null}
        <p className="rounded-md bg-background px-2 py-1.5 font-mono text-xs ring-1 ring-border">
          {rice.reach.value} × {num(rice.impact.value)} × {pct(rice.confidence.value)} ÷ {rice.effort.points} = {num(rice.score, 2)}
        </p>
        {decision.constraint ? (
          <p className="text-xs">
            Contrainte {CONSTRAINT_LABEL[decision.constraint.kind].toLowerCase()} ·{" "}
            {decision.constraint.confirmationStale ? (
              <span className="font-medium text-warn-fg">à revoir</span>
            ) : decision.constraint.confirmed ? (
              "confirmée par le PO"
            ) : (
              "non confirmée"
            )}
          </p>
        ) : null}
        <TrendBars trend={theme.trend} />
      </div>
    </div>
  );
}

function ForceDialog({ theme, current, onClose }: { theme: Theme | null; current: MoscowDecision | null; onClose: () => void }) {
  const { force } = useOverrides();
  const [moscow, setMoscow] = useState<ForceableClass | null>(null);
  const [motif, setMotif] = useState("");
  const choices = FORCEABLE_CLASSES.filter((c) => c !== current?.moscow);
  const valid = moscow !== null && motif.trim().length >= 5;

  return (
    <Dialog
      open={theme !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setMoscow(null);
          setMotif("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forcer la catégorie</DialogTitle>
          <DialogDescription>
            {theme?.title} est aujourd&apos;hui {current?.moscow}. Le motif apparaîtra comme raison dans la priorisation et dans l&apos;export.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!theme || moscow === null || !valid) return;
            force(theme.key, moscow, motif.trim());
            toast.success(`${theme.title} : ${moscow}`, { description: "Classement et capacité recalculés." });
            onClose();
            setMoscow(null);
            setMotif("");
          }}
        >
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Nouvelle catégorie">
            {choices.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={moscow === c}
                onClick={() => setMoscow(c)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-[border-color,background-color,transform] duration-150 ease-(--ease-out) active:scale-[0.97]",
                  moscow === c ? "border-foreground bg-muted" : "hover:bg-muted/50",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motif">Motif (obligatoire)</Label>
            <Textarea
              id="motif"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex. : engagement pris auprès d'un client Enterprise en comité du 12 novembre"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!valid}>
              Appliquer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
