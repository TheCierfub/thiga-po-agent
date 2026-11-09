import { PageSkeleton } from "@/components/etai/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react";
import { CategoryBadge, Empty, FeedbackRef, Section, TrendBars } from "@/components/etai/bits";
import { ExportPanel, ExportPanelSkeleton } from "@/components/etai/export-panel";
import { ThemeMoscow, ThemeNav } from "@/components/etai/theme-nav";
import { DEMO_BATCHES, isDemoBatch } from "@/lib/etai/batches";
import { readExportMode } from "@/lib/etai/export-mode";
import { SocialMark } from "@/components/etai/social-mark";
import { CHANNEL_LABEL, MATCH_LABEL, feedbackWho, highlightQuotes } from "@/lib/etai/labels";
import { getBatchView, getDemoBatchView } from "@/lib/etai/view";
import { cn } from "@/lib/utils";

export async function generateStaticParams() {
  const views = await Promise.all(DEMO_BATCHES.map((b) => getDemoBatchView(b)));
  const keys = [...new Set(views.flatMap((v) => v.state.themes.map((t) => t.key)))];
  return keys.map((key) => ({ key }));
}

const INVEST_LABEL = {
  independent: "Indépendante",
  negotiable: "Négociable",
  valuable: "Valeur",
  estimable: "Estimable",
  small: "Petite",
  testable: "Testable",
} as const;

export default function ThemePage({ params }: PageProps<"/[batch]/themes/[key]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ThemePageContent params={params} />
    </Suspense>
  );
}

async function ThemePageContent({ params }: Pick<PageProps<"/[batch]/themes/[key]">, "params">) {
  const { batch, key } = await params;
  if (!isDemoBatch(batch)) notFound();
  const view = await getBatchView(batch);
  const theme = view.state.themes.find((t) => t.key === key);
  const nav = <ThemeNav current={key} />;

  if (!theme) {
    return (
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {nav}
        <div className="space-y-3">
          <Empty>
            Ce thème n&apos;existe pas dans le lot du {batch}. Il apparaît dans un autre lot, ou ses feedbacks sont sortis de la fenêtre de 28 jours.
          </Empty>
          <Link href={`/${batch}/priorisation`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" /> Retour à la priorisation
          </Link>
        </div>
      </div>
    );
  }

  const story = view.state.stories.find((s) => s.themeKey === key && s.status === "brouillon");
  const staleStory = !story ? view.state.stories.find((s) => s.themeKey === key && s.status === "obsolete") : undefined;
  const issue = theme.backlogIssueId ? view.backlog.find((i) => i.id === theme.backlogIssueId) : undefined;
  const feedbacks = new Map(view.state.feedbacks.map((f) => [f.id, f]));
  const matches = new Map(view.state.matches.map((m) => [m.feedbackId, m]));
  const classes = new Map(view.state.classifications.map((c) => [c.feedbackId, c]));
  const verified = [...theme.quotes, ...(story?.evidence ?? [])];
  const sources = [...theme.feedbackIds, ...theme.relatedSignalIds.filter((id) => !theme.feedbackIds.includes(id))];
  const assessment = view.state.assessments.find((a) => a.themeKey === key);
  const ref = story ? view.strategy.referenceStories.find((r) => r.id === story.referenceStoryId) : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {nav}
      <div className="min-w-0 space-y-8">
        <div className="flex flex-col gap-4 animate-enter xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ThemeMoscow themeKey={key} />
              {assessment ? <CategoryBadge value={assessment.category} rationale={assessment.categoryRationale} /> : null}
              <TrendBars trend={theme.trend} />
              {issue ? (
                <span className="text-xs text-muted-foreground">
                  {theme.backlogRelation === "doublon" ? "Doublon de" : "Lié à"} <span className="font-mono">{issue.id}</span> · {issue.titre} ({issue.statut})
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Absent du backlog</span>
              )}
            </div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{theme.title}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">{theme.problem}</p>
            {theme.creationRationale ? <p className="max-w-2xl text-sm">{theme.creationRationale}</p> : null}
            {theme.relatedThemeIds?.length ? (
              <p className="text-sm text-muted-foreground">
                Lié à{" "}
                {theme.relatedThemeIds.map((id, index) => {
                  const linked = view.state.themes.find((item) => item.key === id);
                  return (
                    <span key={id}>
                      {index > 0 ? ", " : null}
                      <Link href={`/${batch}/themes/${id}`} className="hover:text-foreground hover:underline">
                        {linked?.title ?? id}
                      </Link>
                    </span>
                  );
                })}
              </p>
            ) : null}
          </div>
          <Suspense fallback={<ExportPanelSkeleton />}>
            <ExportPanelWithMode batch={batch} themeKey={key} hasStory={story !== undefined} existingIssueId={theme.backlogIssueId} />
          </Suspense>
        </div>

        <Section index={1} title="User story" description={story ? `Brouillon rédigé sur le lot du ${story.batch}, à relire avant validation.` : undefined}>
          {story ? (
            <div className="space-y-6 rounded-xl border bg-card p-5">
              <p className="text-[15px] leading-relaxed">
                <span className="text-muted-foreground">En tant que </span>
                {story.asA}
                <span className="text-muted-foreground">, je veux </span>
                {story.iWant}
                <span className="text-muted-foreground">, afin que </span>
                {story.soThat}.
              </p>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Critères d&apos;acceptation</h3>
                <ol className="space-y-2">
                  {story.acceptanceCriteria.map((c, i) => (
                    <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-1 text-sm">
                      <span className="font-mono text-xs leading-5 text-muted-foreground">{i + 1}.</span>
                      <span>
                        <span className="font-medium">Étant donné</span> {c.given}, <span className="font-medium">quand</span> {c.when},{" "}
                        <span className="font-medium">alors</span> {c.then}.
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complexité relative</h3>
                  <p className="text-sm">
                    <span className="font-mono font-medium">{story.size}</span> · {view.strategy.sizePoints[story.size]} points
                    {ref ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · référence « {ref.title} » ({ref.size})
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{story.sizeRationale}</p>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">INVEST</h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {(Object.keys(INVEST_LABEL) as (keyof typeof INVEST_LABEL)[]).map((k) => (
                      <li
                        key={k}
                        title={story.invest[k].note}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 ring-inset",
                          story.invest[k].ok ? "text-foreground/80 ring-border" : "bg-warn-bg text-warn-fg ring-warn-border",
                        )}
                      >
                        {story.invest[k].ok ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
                        {INVEST_LABEL[k]}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questions ouvertes</h3>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {story.openQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
                {story.outOfScope.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hors périmètre</h3>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                      {story.outOfScope.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <Empty>
              {staleStory
                ? `La story rédigée le ${staleStory.batch} est obsolète : ses preuves ont changé.`
                : "Pas de story rédigée pour ce thème : l'agent rédige la story du premier thème retenu à chaque lot."}{" "}
              L&apos;export reste possible : l&apos;issue reprend le problème, le score et les citations.
            </Empty>
          )}
        </Section>

        <Section
          index={2}
          title={`Feedbacks sources (${sources.length})`}
          description="Les passages surlignés sont les citations vérifiées mot pour mot dans le texte masqué."
        >
          <ul className="space-y-3">
            {sources.map((id) => {
              const f = feedbacks.get(id);
              if (!f) return null;
              const m = matches.get(id);
              const c = classes.get(id);
              const account = m?.accountId ? view.accounts[m.accountId] : undefined;
              const quotes = [...verified.filter((q) => q.feedbackId === id).map((q) => q.text), ...(c?.quotes.map((q) => q.text) ?? [])];
              const rejected = [...theme.rejectedQuotes.filter((q) => q.feedbackId === id).map((q) => q.text), ...(c?.rejectedQuotes ?? [])];
              return (
                <li key={id} id={id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {f ? feedbackWho(f.author, account?.nom, MATCH_LABEL[m?.confidence ?? "non_rapproche"]) : MATCH_LABEL[m?.confidence ?? "non_rapproche"]}
                    </span>
                    <span>{CHANNEL_LABEL[f.channel]}</span>
                    {f.channel === "social" ? <SocialMark url={f.sourceUrl} /> : null}
                    <span>{new Date(f.receivedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" })}</span>
                    {theme.relatedSignalIds.includes(id) && !theme.feedbackIds.includes(id) ? <span>signal lié</span> : null}
                    {view.changes && view.newFeedbackIds.includes(id) ? <span className="font-medium text-(--moscow-must)">nouveau</span> : null}
                    <FeedbackRef batch={batch} id={id} className="ml-auto" />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
                    {highlightQuotes(f.maskedText, quotes).map((part, i) =>
                      part.quote ? (
                        <mark key={i} className="rounded-sm bg-mark px-0.5 text-foreground">
                          {part.text}
                        </mark>
                      ) : (
                        <span key={i}>{part.text}</span>
                      ),
                    )}
                  </p>
                  {rejected.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Citation écartée, introuvable mot pour mot : {rejected.map((r) => `« ${r} »`).join(", ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );
}

async function ExportPanelWithMode(props: { batch: (typeof DEMO_BATCHES)[number]; themeKey: string; hasStory: boolean; existingIssueId: string | null }) {
  const mode = await readExportMode();
  return <ExportPanel {...props} mode={mode} />;
}
