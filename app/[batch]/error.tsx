"use client";

import { Button } from "@/components/ui/button";

export default function BatchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h1 className="font-semibold">L&apos;analyse du lot n&apos;a pas pu être chargée</h1>
      <p className="text-sm text-muted-foreground">
        {error.message || "Erreur inattendue."} Vérifiez que fixtures/llm et data/ sont présents, puis réessayez.
      </p>
      <Button variant="outline" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
