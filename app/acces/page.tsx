import { Suspense } from "react";
import { AccesForm } from "@/components/etai/acces-form";
import { safeNextPath } from "@/core/auth/gate";

export const instant = false;

export default function AccesPage({ searchParams }: PageProps<"/acces">) {
  return (
    <Suspense>
      <Acces searchParams={searchParams} />
    </Suspense>
  );
}

async function Acces({ searchParams }: { searchParams: PageProps<"/acces">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-xl font-semibold tracking-tight">Accès</h1>
      <p className="mt-2 text-sm text-muted-foreground">Entrez le code qui vous a été remis pour ouvrir la démo.</p>
      <div className="mt-6">
        <AccesForm nextPath={next} />
      </div>
    </main>
  );
}
