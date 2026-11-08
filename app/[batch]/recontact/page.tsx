import { Suspense } from "react";
import { PageSkeleton } from "@/components/etai/page-skeleton";
import { notFound } from "next/navigation";
import { RecontactBoard } from "@/components/etai/recontact-board";
import { isDemoBatch } from "@/lib/etai/batches";

export default function RecontactPage({ params }: PageProps<"/[batch]/recontact">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RecontactPageContent params={params} />
    </Suspense>
  );
}

async function RecontactPageContent({ params }: Pick<PageProps<"/[batch]/recontact">, "params">) {
  const { batch } = await params;
  if (!isDemoBatch(batch)) notFound();
  return (
    <div className="space-y-8">
      <div className="animate-enter">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Recontact</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Brouillons pour les auteurs à recontacter : feedbacks trop flous pour décider, et auteurs que l&apos;agent n&apos;a pas su
          rattacher à un compte. Relisez, modifiez, puis envoyez : en démo, le message est déposé dans une boîte de test, jamais
          envoyé au client.
        </p>
      </div>
      <RecontactBoard />
    </div>
  );
}
