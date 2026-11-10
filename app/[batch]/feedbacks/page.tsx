import { Suspense } from "react";
import { PageSkeleton } from "@/components/etai/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddFeedbackForm } from "@/components/etai/add-feedback";
import { ArrivalItem, ArrivalWatch } from "@/components/etai/arrival-watch";
import { HashScroll } from "@/components/etai/hash-scroll";
import { SocialMark } from "@/components/etai/social-mark";
import { feedbackLinearMark } from "@/core/export/comment";
import { readPollSeconds } from "@/core/sources/x-listen";
import { isDemoBatch } from "@/lib/etai/batches";
import { CHANNEL_LABEL, MATCH_LABEL, TYPE_LABEL, feedbackWho } from "@/lib/etai/labels";
import { readAccess } from "@/lib/etai/access";
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
  const [{ state, accounts: accountsById, newFeedbackIds, changes, dataMode, dataModeDetail }, access] = await Promise.all([
    getBatchView(batch),
    readAccess(),
  ]);
  const matches = new Map(state.matches.map((m) => [m.feedbackId, m]));
  const classes = new Map(state.classifications.map((c) => [c.feedbackId, c]));
  const themeOf = (id: string) => state.themes.find((t) => t.feedbackIds.includes(id) || t.relatedSignalIds.includes(id));
  const fresh = new Set(newFeedbackIds);
  const feedbacks = [...state.feedbacks].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const accounts = Object.values(accountsById)
    .map((account) => ({ id: account.id, nom: account.nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <div className="space-y-6">
      <div className="animate-enter">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Feedbacks du lot</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {feedbacks.length} feedbacks sur la fenêtre de 28 jours, texte masqué (e-mails, téléphones et adresses remplacés).
        </p>
      </div>
      <AddFeedbackForm
        accounts={accounts}
        live={dataMode === "live"}
        detail={dataModeDetail}
        profile={process.env.ETAI_LLM_PROFILE?.trim() || "B"}
        canSpend={access.canSpend}
        returnPath={`/${batch}/feedbacks`}
      />
      <ArrivalWatch
        ids={feedbacks.map((feedback) => feedback.id)}
        intervalMs={batch === "jeudi" ? readPollSeconds(process.env.ETAI_X_POLL_SECONDS) * 1000 : 0}
      >
      <ul className="space-y-2">
        {feedbacks.map((f) => {
          const m = matches.get(f.id);
          const c = classes.get(f.id);
          const theme = themeOf(f.id);
          const account = m?.accountId ? accountsById[m.accountId] : undefined;
          const attachment = state.attachments?.find((item) => item.feedbackId === f.id);
          const mark = feedbackLinearMark(state.themes, f.id);
          return (
            <ArrivalItem
              key={f.id}
              id={f.id}
              className="scroll-mt-4 rounded-xl border bg-card p-4 transition-[box-shadow] duration-300 target:ring-2 target:ring-(--moscow-should)/50 md:scroll-mt-32"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">{f.id}</span>
                <span className="font-medium text-foreground">
                  {feedbackWho(f.author, account?.nom, MATCH_LABEL[m?.confidence ?? "non_rapproche"])}
                </span>
                <span>{CHANNEL_LABEL[f.channel]}</span>
                {f.channel === "social" ? <SocialMark url={f.sourceUrl} /> : null}
                <span>{new Date(f.receivedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" })}</span>
                {c ? <span>{TYPE_LABEL[c.type]}</span> : null}
                {mark ? <span className={mark.tone === "attente" ? "font-medium text-warn-fg" : "text-foreground"}>{mark.text}</span> : null}
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
              {attachment ? <p className="mt-2 text-xs text-muted-foreground">{attachment.rationale}</p> : null}
            </ArrivalItem>
          );
        })}
      </ul>
      <HashScroll />
      </ArrivalWatch>
    </div>
  );
}
