import { PageSkeleton } from "@/components/etai/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { CategoryBadge, Empty, Section, TrendBars } from "@/components/etai/bits";
import { SourceList, type SourceItem } from "@/components/etai/source-list";
import { StoryPanel } from "@/components/etai/story-panel";
import { ThemeMoscow, ThemeNav } from "@/components/etai/theme-nav";
import { feedbackDate } from "@/core/stories/place";
import { DEMO_BATCHES, isDemoBatch } from "@/lib/etai/batches";
import { readExportMode } from "@/lib/etai/export-mode";
import { CHANNEL_LABEL } from "@/lib/etai/labels";
import { getBatchView, getDemoBatchView } from "@/lib/etai/view";

export async function generateStaticParams() {
  const views = await Promise.all(DEMO_BATCHES.map((b) => getDemoBatchView(b)));
  const keys = [...new Set(views.flatMap((v) => v.state.themes.map((t) => t.key)))];
  return keys.map((key) => ({ key }));
}

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

  const story = view.state.stories.find((s) => s.themeKey === key && s.status === "brouillon") ?? null;
  const issue = theme.backlogIssueId ? view.backlog.find((i) => i.id === theme.backlogIssueId) : undefined;
  const feedbacks = new Map(view.state.feedbacks.map((f) => [f.id, f]));
  const matches = new Map(view.state.matches.map((m) => [m.feedbackId, m]));
  const classes = new Map(view.state.classifications.map((c) => [c.feedbackId, c]));
  const sources = [...theme.feedbackIds, ...theme.relatedSignalIds.filter((id) => !theme.feedbackIds.includes(id))]
    .flatMap((id) => {
      const feedback = feedbacks.get(id);
      if (!feedback) return [];
      const match = matches.get(id);
      const account = match?.accountId ? view.accounts[match.accountId] : undefined;
      const classification = classes.get(id);
      const quotes = [...theme.quotes.filter((quote) => quote.feedbackId === id).map((quote) => quote.text), ...(classification?.quotes.map((quote) => quote.text) ?? [])];
      const rejected = [...theme.rejectedQuotes.filter((quote) => quote.feedbackId === id).map((quote) => quote.text), ...(classification?.rejectedQuotes ?? [])];
      const note = [
        theme.relatedSignalIds.includes(id) && !theme.feedbackIds.includes(id) ? "signal lié" : null,
        view.changes && view.newFeedbackIds.includes(id) ? "nouveau" : null,
      ].filter(Boolean).join(" · ") || null;
      const item: SourceItem & { receivedAt: string } = {
        id,
        receivedAt: feedback.receivedAt,
        company: account?.nom ?? null,
        person: feedback.author.anonymous ? null : feedback.author.name?.trim() || null,
        sentiment: classification?.sentiment ?? "indetermine",
        dateLabel: feedbackDate(feedback.receivedAt),
        channel: CHANNEL_LABEL[feedback.channel],
        body: feedback.maskedText,
        quotes,
        rejected,
        href: `/${batch}/feedbacks#${id}`,
        note,
      };
      return [item];
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const assessment = view.state.assessments.find((a) => a.themeKey === key);
  const exportMode = await readExportMode();

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {nav}
      <div className="min-w-0 space-y-8">
        <div className="min-w-0 space-y-2 animate-enter">
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

        <Section index={1} title="User story" description="Rédigée à la demande, puis modifiable avant l’envoi vers Linear.">
          <StoryPanel
            batch={batch}
            themeKey={key}
            initialStory={story}
            live={view.dataMode === "live"}
            mode={exportMode}
            existingIssueId={theme.backlogIssueId}
          />
        </Section>

        <Section index={2} title={`Feedbacks sources (${sources.length})`} description="Du plus récent au plus ancien. La ligne s’ouvre pour le message complet.">
          <SourceList items={sources} />
        </Section>
      </div>
    </div>
  );
}

