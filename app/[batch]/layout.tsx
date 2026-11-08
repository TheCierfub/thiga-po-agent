import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BatchSwitcher } from "@/components/etai/batch-switcher";
import { ExportStatus, ExportStatusFallback } from "@/components/etai/export-status";
import { NavTabs } from "@/components/etai/nav-tabs";
import { DEMO_BATCHES, isDemoBatch } from "@/lib/etai/batches";
import { OverridesProvider } from "@/lib/etai/overrides";
import { getBatchView } from "@/lib/etai/view";

/** Les deux lots sont prérendus ; changer de lot remplace toute l'interface, ce n'est pas une navigation interne. */
export const instant = false;

export function generateStaticParams() {
  return DEMO_BATCHES.map((batch) => ({ batch }));
}

export default async function BatchLayout({ children, params }: LayoutProps<"/[batch]">) {
  const { batch } = await params;
  if (!isDemoBatch(batch)) notFound();
  const [view, lundi, jeudi] = await Promise.all([getBatchView(batch), getBatchView("lundi"), getBatchView("jeudi")]);
  const storyTheme = view.state.stories.find((s) => s.status === "brouillon")?.themeKey ?? view.state.themes[0]?.key ?? null;

  return (
    <OverridesProvider view={view}>
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="font-semibold tracking-tight">Étai</span>
            <span className="truncate text-sm text-muted-foreground">Agent produit · Nadia, Product Owner</span>
          </div>
          <div className="flex items-center gap-2">
            <Suspense fallback={<ExportStatusFallback />}>
              <ExportStatus />
            </Suspense>
            <BatchSwitcher current={batch} fresh={{ lundi: lundi.newFeedbackIds.length, jeudi: jeudi.newFeedbackIds.length }} />
          </div>
          <div className="w-full">
            <NavTabs batch={batch} storyTheme={storyTheme} drafts={view.drafts.length} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        Mode démo sans clé : réponses LLM rejouées depuis fixtures/llm, calculs RICE et MoSCoW refaits en code à chaque affichage.
        Aucun message n&apos;est envoyé ; les exports vont vers Linear seulement si la clé est configurée.
      </footer>
    </OverridesProvider>
  );
}
