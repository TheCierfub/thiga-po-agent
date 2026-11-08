import { Suspense } from "react";
import { PageSkeleton } from "@/components/etai/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoBatch } from "@/lib/etai/batches";
import { CHANNEL_LABEL, MATCH_LABEL, TYPE_LABEL } from "@/lib/etai/labels";
import { getBatchView } from "@/lib/etai/view";

export default function FeedbacksPage({ params }: PageProps<"/[batch]/feedbacks">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FeedbacksPageContent params={params} />
    </Suspense>
  );
}

async function FeedbacksPageContent({ params }: Pick<PageProps<"/[batch]/feedbacks">, "params">) {
  const { batch } = await params;
  if (!isDemoBatch(batch)) notFound();
  const { state, accounts, newFeedbackIds, changes } = await getBatchView(batch);
  const matches = new Map(state.matches.map((m) => [m.feedbackId, m]));
  const classes = new Map(state.classifications.map((c) => [c.feedbackId, c]));
  const themeOf = (id: string) => state.themes.find((t) => t.feedbackIds.includes(id) || t.relatedSignalIds.includes(id));
  const fresh = new Set(newFeedbackIds);
  const feedbacks = [...state.feedbacks].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <div className="space-y-6">
      <div className="animate-enter">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Feedbacks du lot</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {feedbacks.length} feedbacks sur la fenêtre de 28 jours, texte masqué (e-mails, téléphones et adresses remplacés).
        </p>
      </div>
      <ul className="space-y-2">
        {feedbacks.map((f) => {
          const m = matches.get(f.id);
          const c = classes.get(f.id);
          const theme = themeOf(f.id);
          const account = m?.accountId ? accounts[m.accountId] : undefined;
          return (
            <li
              key={f.id}
              id={f.id}
              className="scroll-mt-32 rounded-xl border bg-card p-4 transition-[box-shadow] duration-300 target:ring-2 target:ring-(--moscow-should)/50"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">{f.id}</span>
                <span className="font-medium text-foreground">{account?.nom ?? MATCH_LABEL[m?.confidence ?? "non_rapproche"]}</span>
                <span>{CHANNEL_LABEL[f.channel]}</span>
                <span>{new Date(f.receivedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}</span>
                {c ? <span>{TYPE_LABEL[c.type]}</span> : null}
                {c?.injection.quarantined ? <span className="font-medium text-warn-fg">quarantaine</span> : null}
                {changes && fresh.has(f.id) ? <span className="font-medium text-(--moscow-must)">nouveau</span> : null}
                {theme ? (
                  <Link href={`/${batch}/themes/${theme.key}`} className="ml-auto hover:text-foreground hover:underline">
                    {theme.title}
                  </Link>
                ) : null}
              </div>
              <p className={c?.injection.quarantined ? "mt-2 font-mono text-xs leading-relaxed whitespace-pre-line text-muted-foreground" : "mt-2 text-sm leading-relaxed whitespace-pre-line"}>
                {f.maskedText}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
