import { Suspense } from "react";
import { XListen } from "@/components/etai/x-listen";
import { PageSkeleton } from "@/components/etai/page-skeleton";
import { DEFAULT_X_QUERY, formatDelay, readPollSeconds, readSessionCapUsd } from "@/core/sources/x-listen";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readAccess } from "@/lib/etai/access";
import { getBatchView } from "@/lib/etai/view";

export const instant = false;

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Paris" });
}

export default function OpsEcoutePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OpsEcoute />
    </Suspense>
  );
}

async function OpsEcoute() {
  const [view, access] = await Promise.all([getBatchView("jeudi"), readAccess()]);
  const rows = view.state.feedbacks
    .filter((feedback) => feedback.channel === "social" && feedback.listening)
    .sort((a, b) => (b.listening?.detectedAt ?? "").localeCompare(a.listening?.detectedAt ?? ""));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">Exploitation</p>
        <h1 className="text-xl font-semibold tracking-tight">Écoute X</h1>
        <p className="text-sm text-muted-foreground">Cette page n’est pas dans la navigation de Nadia. On y arrive par l’adresse.</p>
      </header>
      <XListen
        enabled={Boolean(process.env.TREG_TOKEN?.trim())}
        live={view.dataMode === "live"}
        detail={view.dataModeDetail}
        query={process.env.ETAI_X_QUERY?.trim() || DEFAULT_X_QUERY}
        pollSeconds={readPollSeconds(process.env.ETAI_X_POLL_SECONDS)}
        maxSessionUsd={readSessionCapUsd(process.env.ETAI_X_MAX_SESSION_USD)}
        canSpend={access.canSpend}
      />
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Délais</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun post enregistré pour l’instant. L’historique reste après un rechargement.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead>Publié sur X</TableHead>
                <TableHead>Détecté</TableHead>
                <TableHead>Traité</TableHead>
                <TableHead>Indexation</TableHead>
                <TableHead>Traitement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((feedback) => {
                const listening = feedback.listening!;
                const indexMs = Date.parse(listening.detectedAt) - Date.parse(listening.publishedAt);
                const processMs = listening.processedAt ? Date.parse(listening.processedAt) - Date.parse(listening.detectedAt) : null;
                return (
                  <TableRow key={feedback.id}>
                    <TableCell>
                      <span className="font-medium">{feedback.author.handle ?? feedback.author.name ?? feedback.id}</span>
                      {feedback.sourceUrl ? (
                        <a href={feedback.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-muted-foreground hover:underline">
                          {feedback.sourceUrl}
                        </a>
                      ) : null}
                    </TableCell>
                    <TableCell>{when(listening.publishedAt)}</TableCell>
                    <TableCell>{when(listening.detectedAt)}</TableCell>
                    <TableCell>{when(listening.processedAt)}</TableCell>
                    <TableCell>{formatDelay(indexMs)}</TableCell>
                    <TableCell>{processMs === null ? "—" : formatDelay(processMs)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
