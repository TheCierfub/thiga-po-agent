import { Suspense } from "react";
import { ConnexionForm } from "@/components/etai/connexion-form";
import { safeNextPath } from "@/core/auth/gate";

export const instant = false;

export default function ConnexionPage({ searchParams }: PageProps<"/connexion">) {
  return (
    <Suspense>
      <Connexion searchParams={searchParams} />
    </Suspense>
  );
}

async function Connexion({ searchParams }: { searchParams: PageProps<"/connexion">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-xl font-semibold tracking-tight">Connexion</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        La lecture du lot reste ouverte. La génération, l&apos;ajout d&apos;un feedback et l&apos;export avec la clé du serveur demandent un lien de connexion.
      </p>
      <div className="mt-6">
        <ConnexionForm nextPath={next} />
      </div>
    </main>
  );
}
