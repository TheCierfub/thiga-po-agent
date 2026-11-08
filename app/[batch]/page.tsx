import { Suspense } from "react";
import { PageSkeleton } from "@/components/etai/page-skeleton";
import Link from "next/link";
import { ArrowRightIcon, ShieldAlertIcon } from "lucide-react";
import { BriefThemes } from "@/components/etai/brief-themes";
import { ChangesPanel } from "@/components/etai/changes-panel";
import { Empty, FeedbackRef, Section, Stat } from "@/components/etai/bits";
import { isDemoBatch } from "@/lib/etai/batches";
import { CHANNEL_LABEL, SIGNAL_LABEL, eur } from "@/lib/etai/labels";
import { getBatchView } from "@/lib/etai/view";
import { notFound } from "next/navigation";

const excerpt = (text: string, max = 220) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

export default function BriefPage({ params }: PageProps<"/[batch]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BriefPageContent params={params} />
    </Suspense>
  );
}

async function BriefPageContent({ params }: Pick<PageProps<"/[batch]">, "params">) {
  const { batch } = await params;
  if (!isDemoBatch(batch)) notFound();
  const view = await getBatchView(batch);
  const { state, accounts } = view;
  const fresh = new Set(view.newFeedbackIds);
  const feedback = new Map(state.feedbacks.map((f) => [f.id, f]));
  const match = new Map(state.matches.map((m) => [m.feedbackId, m]));
  const themeOf = (id: string) => state.themes.find((t) => t.feedbackIds.includes(id) || t.relatedSignalIds.includes(id));
  const quarantined = state.classifications.filter((c) => c.injection.quarantined);
  const churn = state.classifications.filter((c) => c.type === "signal_churn");
  const critical = state.classifications.filter((c) => c.type === "bug" && c.severity === "critique");
  const certain = state.matches.filter((m) => fresh.has(m.feedbackId) && m.confidence === "certaine").length;

  return (
    <div className="space-y-10">
      <div className="animate-enter">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Brief de la semaine</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Lot du {batch}, arrêté au {new Date(state.referenceDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.{" "}
          {view.newFeedbackIds.length} nouveaux feedbacks ({state.feedbacks.length} sur la fenêtre de 28 jours), {certain} auteurs rattachés à un compte avec certitude.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 animate-enter sm:grid-cols-3 lg:grid-cols-5" style={{ "--i": 1 } as React.CSSProperties}>
        <Stat label="Nouveaux feedbacks" value={view.newFeedbackIds.length} hint={`${state.feedbacks.length} sur 28 jours`} />
        <Stat label="Thèmes" value={state.themes.length} hint={`${state.themes.filter((t) => t.trend.kind === "tendance").length} en hausse`} />
        <Stat label="Signaux de churn" value={churn.length} tone={churn.length > 0 ? "warn" : undefined} />
        <Stat label="Bugs critiques" value={critical.length} tone={critical.length > 0 ? "warn" : undefined} />
        <Stat label="En quarantaine" value={quarantined.length} hint="consignes détectées" />
      </div>

      {view.changes ? (
        <Section index={2} title={`Ce qui a changé depuis ${view.changes.previousBatch}`} description="Seuls les thèmes dont les preuves ont changé ont été réévalués ; tous les scores ont été recalculés.">
          <ChangesPanel batch={batch} changes={view.changes} accounts={accounts} />
        </Section>
      ) : null}

      <Section index={3} title="Thèmes de la semaine" description="Classés par MoSCoW puis par RICE. Les arbitrages faits dans Priorisation s'appliquent ici.">
        <BriefThemes />
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section index={4} title="Signaux de churn" description="Clients qui évoquent un départ, avec le thème qui les concerne.">
          {churn.length === 0 ? (
            <Empty>Aucun signal de churn cette semaine.</Empty>
          ) : (
            <ul className="divide-y rounded-xl border">
              {churn.map((c) => {
                const f = feedback.get(c.feedbackId)!;
                const account = match.get(f.id)?.accountId ? accounts[match.get(f.id)!.accountId!] : undefined;
                const theme = themeOf(f.id);
                return (
                  <li key={f.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium">{account ? account.nom : "Compte non rapproché"}</span>
                      {account ? (
                        <span className="text-xs text-muted-foreground">
                          {account.offre} · {eur(account.arr)} d&apos;ARR · risque {account.risque_churn}
                        </span>
                      ) : null}
                      {fresh.has(f.id) && view.changes ? <span className="text-xs font-medium text-(--moscow-must)">nouveau</span> : null}
                      <FeedbackRef batch={batch} id={f.id} className="ml-auto" />
                    </div>
                    <p className="text-sm text-muted-foreground">{excerpt(f.maskedText, 180)}</p>
                    {theme ? (
                      <Link href={`/${batch}/themes/${theme.key}`} className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground">
                        Lié à « {theme.title} » <ArrowRightIcon className="size-3" />
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section index={5} title="Bugs critiques routés" description="Un bug critique sur le cœur du produit monte en Must, sous réserve de confirmation du PO.">
          {critical.length === 0 ? (
            <Empty>Aucun bug critique.</Empty>
          ) : (
            <ul className="divide-y rounded-xl border">
              {critical.map((c) => {
                const f = feedback.get(c.feedbackId)!;
                const theme = themeOf(f.id);
                return (
                  <li key={f.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{c.underlyingProblem}</span>
                      <FeedbackRef batch={batch} id={f.id} className="ml-auto" />
                    </div>
                    <p className="text-xs text-muted-foreground">{CHANNEL_LABEL[f.channel]}</p>
                    {theme ? (
                      <Link href={`/${batch}/themes/${theme.key}`} className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground">
                        Routé vers « {theme.title} » <ArrowRightIcon className="size-3" />
                      </Link>
                    ) : (
                      <p className="text-xs text-muted-foreground">Pas encore rattaché à un thème.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section
        index={6}
        title={
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlertIcon className="size-4 text-amber-600" /> Quarantaine
          </span>
        }
        description="Feedbacks qui contiennent une consigne adressée à l'agent. Ils sont exclus du scoring ; aucune consigne n'a été suivie. Le texte est affiché comme donnée, pour relecture."
      >
        {quarantined.length === 0 ? (
          <Empty>Aucun feedback en quarantaine.</Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {quarantined.map((c) => {
              const f = feedback.get(c.feedbackId)!;
              const reasons = [...c.injection.heuristicSignals.map((s) => SIGNAL_LABEL[s] ?? s), ...(c.injection.llmSuspected ? ["signalé aussi par le LLM"] : [])];
              return (
                <li key={f.id} className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{CHANNEL_LABEL[f.channel]}</span>
                    <FeedbackRef batch={batch} id={f.id} className="ml-auto" />
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {reasons.map((r) => (
                      <li key={r} className="rounded-md bg-amber-100/80 px-1.5 py-0.5 text-xs text-amber-900">
                        {r}
                      </li>
                    ))}
                  </ul>
                  <blockquote className="mt-3 line-clamp-4 border-l-2 border-amber-300 pl-3 font-mono text-xs leading-relaxed text-muted-foreground">
                    {f.maskedText}
                  </blockquote>
                  <p className="mt-2 text-xs text-muted-foreground">Faux positif ? Libérez-le dans data/po-decisions.json après relecture.</p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {view.drafts.length > 0 ? (
        <Link
          href={`/${batch}/recontact`}
          className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors duration-150 animate-enter hover:bg-muted/50"
          style={{ "--i": 7 } as React.CSSProperties}
        >
          <span>
            <span className="font-medium">{view.drafts.length} brouillons de recontact</span>
            <span className="text-muted-foreground"> : feedbacks trop flous et auteurs à rattacher à un compte.</span>
          </span>
          <ArrowRightIcon className="size-4 text-muted-foreground" />
        </Link>
      ) : null}
    </div>
  );
}
