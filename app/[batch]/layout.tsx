import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BatchSwitcher } from "@/components/etai/batch-switcher";
import { ExportStatus, ExportStatusFallback } from "@/components/etai/export-status";
import { SessionMenu, SessionMenuFallback } from "@/components/etai/session-menu";
import { NavTabs } from "@/components/etai/nav-tabs";
import { DEMO_BATCHES, isDemoBatch } from "@/lib/etai/batches";
import { OverridesProvider } from "@/lib/etai/overrides";
import { getBatchView } from "@/lib/etai/view";

/** Les deux lots sont prérendus en démo. Le mode direct lit la base à la requête. */
export const instant = false;

export function generateStaticParams() {
  return DEMO_BATCHES.map((batch) => ({ batch }));
}

export default function BatchLayout({ children, params }: LayoutProps<"/[batch]">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <BatchShell params={params}>{children}</BatchShell>
    </Suspense>
  );
}

function ShellFallback() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mt-6 h-40 animate-pulse rounded-xl bg-muted/60" />
    </div>
  );
}

async function BatchShell({ children, params }: LayoutProps<"/[batch]">) {
  const { batch } = await params;
  if (!isDemoBatch(batch)) notFound();
  const [view, lundi, jeudi] = await Promise.all([getBatchView(batch), getBatchView("lundi"), getBatchView("jeudi")]);
  const storyTheme = view.state.stories.find((s) => s.status === "brouillon")?.themeKey ?? view.state.themes[0]?.key ?? null;
  const live = view.dataMode === "live";

  return (
    <OverridesProvider view={view}>
      <header className="z-30 border-b bg-background md:sticky md:top-0 md:bg-background/85 md:backdrop-blur md:supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="font-semibold tracking-tight">Étai</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={<ExportStatusFallback />}>
              <ExportStatus />
            </Suspense>
            <Suspense fallback={<SessionMenuFallback />}>
              <SessionMenu />
            </Suspense>
            <BatchSwitcher current={batch} fresh={{ lundi: lundi.newFeedbackIds.length, jeudi: jeudi.newFeedbackIds.length }} />
          </div>
          <div className="w-full">
            <NavTabs batch={batch} storyTheme={storyTheme} drafts={view.drafts.length} />
          </div>
        </div>
      </header>
      {live ? null : (
        <div className="border-b bg-warn-bg">
          <p className="mx-auto max-w-6xl px-4 py-2 text-sm text-warn-fg sm:px-6">
            Mode démo : les réponses sont rejouées, sans appel de modèle. Les arbitrages restent dans ce navigateur.
          </p>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        {live
          ? "Les feedbacks, l'analyse et les arbitrages sont enregistrés. Un feedback ajouté est classé seul, puis le RICE et le MoSCoW sont recalculés. Aucun message n'est envoyé."
          : "Mode démo : réponses LLM rejouées depuis fixtures/llm, sans appel de modèle. Les arbitrages restent dans ce navigateur. Aucun message n'est envoyé ; les exports vont vers Linear seulement si la clé est configurée."}
      </footer>
    </OverridesProvider>
  );
}
