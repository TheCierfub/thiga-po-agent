import { Suspense } from "react";
import { PageSkeleton } from "@/components/etai/page-skeleton";
import { notFound } from "next/navigation";
import { PrioritizationBoard } from "@/components/etai/prioritization-board";
import { isDemoBatch } from "@/lib/etai/batches";

export default function PrioritizationPage({ params }: PageProps<"/[batch]/priorisation">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PrioritizationPageContent params={params} />
    </Suspense>
  );
}

async function PrioritizationPageContent({ params }: Pick<PageProps<"/[batch]/priorisation">, "params">) {
  const { batch } = await params;
  if (!isDemoBatch(batch)) notFound();
  return (
    <div className="space-y-8">
      <div className="animate-enter">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Priorisation RICE et MoSCoW</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          RICE = Reach × Impact × Confidence ÷ Effort, calculé en code. Ouvrez une ligne pour voir le détail du calcul. Modifier
          l&apos;effort ou forcer une catégorie recalcule tout de suite le classement. En mode direct, ces arbitrages sont enregistrés
          dans la base ; en mode démo, ils restent dans ce navigateur.
        </p>
      </div>
      <PrioritizationBoard />
    </div>
  );
}
