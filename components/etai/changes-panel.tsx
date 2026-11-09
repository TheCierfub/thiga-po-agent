import Link from "next/link";
import { ArrowRightIcon, TriangleAlertIcon } from "lucide-react";
import type { ChangeReport } from "@/core/pipeline/run";
import { num, pct } from "@/lib/etai/labels";
import type { AccountView } from "@/lib/etai/view";
import { MoscowBadge } from "./bits";

const STATUS_LABEL = {
  nouveau: "Nouveau thème",
  preuves_modifiees: "Preuves modifiées",
  hypotheses_modifiees: "Hypothèses modifiées",
  inchange: "Inchangé",
} as const;

export function ChangesPanel({ batch, changes, accounts }: { batch: string; changes: ChangeReport; accounts: Record<string, AccountView> }) {
  const name = (id: string) => accounts[id]?.nom ?? id;
  const ordered = [...changes.themes].sort((a, b) => Number(b.moscowBefore !== b.moscowAfter) - Number(a.moscowBefore !== a.moscowAfter));
  return (
    <div className="space-y-3">
      {changes.plan.staleConfirmations.length > 0 ? (
        <div className="flex gap-2 rounded-xl border border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            {changes.plan.staleConfirmations.length} confirmation(s) du PO à revoir : les preuves ont changé depuis.{" "}
            L&apos;export de ces thèmes est bloqué tant qu&apos;elles ne sont pas reconfirmées.
          </p>
        </div>
      ) : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {ordered.map((t) => {
          const moved = t.moscowBefore !== t.moscowAfter;
          const facts: string[] = [];
          if (t.newFeedbackIds.length > 0) facts.push(`${t.newFeedbackIds.length} nouveau(x) feedback(s)`);
          if (t.accountsAdded.length > 0) facts.push(`comptes ajoutés : ${t.accountsAdded.map(name).join(", ")}`);
          for (const r of t.accountsRemoved) facts.push(`compte retiré : ${name(r.accountId)} (${r.reason})`);
          if (t.riceBefore !== null && t.riceBefore !== t.riceAfter) facts.push(`RICE ${num(t.riceBefore, 2)} → ${num(t.riceAfter, 2)}`);
          if (t.confidenceBefore !== null && t.confidenceBefore !== t.confidenceAfter) {
            facts.push(`Confidence ${pct(t.confidenceBefore)} → ${pct(t.confidenceAfter)}`);
          }
          if (t.status === "inchange") facts.push("évaluation reprise, sans nouvel appel au modèle");
          return (
            <li key={t.key} className={moved ? "rounded-xl border border-(--moscow-should)/30 bg-card p-4" : "rounded-xl border bg-card p-4"}>
              <div className="flex items-start justify-between gap-3">
                <Link href={`/${batch}/themes/${t.key}`} className="group text-sm font-medium hover:underline">
                  {t.title}
                </Link>
                <span className="flex shrink-0 items-center gap-1">
                  {t.moscowBefore && moved ? (
                    <>
                      <MoscowBadge value={t.moscowBefore} className="opacity-60" />
                      <ArrowRightIcon className="size-3 text-muted-foreground" />
                    </>
                  ) : null}
                  <MoscowBadge value={t.moscowAfter} />
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{STATUS_LABEL[t.status]}</p>
              {facts.length > 0 ? <p className="mt-2 text-sm text-foreground/80">{facts.join(" · ")}</p> : null}
              {moved ? <p className="mt-2 text-xs text-muted-foreground">{t.reasonAfter}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
