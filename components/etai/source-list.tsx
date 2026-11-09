"use client";

import Link from "next/link";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import type { Sentiment } from "@/core/schemas";
import { SENTIMENT_LABEL, highlightQuotes } from "@/lib/etai/labels";
import { cn } from "@/lib/utils";

export interface SourceItem {
  id: string;
  company: string | null;
  person: string | null;
  sentiment: Sentiment;
  dateLabel: string;
  channel: string;
  body: string;
  quotes: string[];
  rejected: string[];
  href: string;
  note: string | null;
}

const SENTIMENT_TONE: Record<Sentiment, string> = {
  positif: "border-ok-fg/45 bg-ok-bg text-ok-fg",
  neutre: "border-border bg-muted text-muted-foreground",
  negatif: "border-sentiment-neg-border bg-sentiment-neg-bg text-sentiment-neg-fg",
  frustre: "border-sentiment-frustre-border bg-sentiment-frustre-bg text-sentiment-frustre-fg",
  indetermine: "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground/75",
};

export function SourceList({ items }: { items: SourceItem[] }) {
  if (items.length === 0) return null;
  return (
    <Accordion className="overflow-hidden rounded-xl border">
      {items.map((item) => {
        const who = [item.company, item.person].filter(Boolean);
        return (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger>
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {who.length > 0 ? (
                  who.map((part, index) => (
                    <span key={`${index}-${part}`} className={index === 0 && item.company ? "font-medium text-foreground" : "text-foreground"}>
                      {part}
                    </span>
                  ))
                ) : (
                  <span className="font-medium">Anonyme</span>
                )}
                <span className={cn("rounded-full border px-1.5 py-px text-[11px] leading-4", SENTIMENT_TONE[item.sentiment])}>
                  {SENTIMENT_LABEL[item.sentiment]}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 pt-0.5 text-xs text-muted-foreground">
                <span>{item.dateLabel}</span>
                <span>{item.channel}</span>
              </span>
            </AccordionTrigger>
            <AccordionPanel>
              {item.note ? <p className="mb-2 text-xs text-muted-foreground">{item.note}</p> : null}
              <p className="leading-relaxed whitespace-pre-line">
                {highlightQuotes(item.body, item.quotes).map((part, index) =>
                  part.quote ? (
                    <mark key={index} className="rounded-sm bg-mark px-0.5 text-foreground">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={index}>{part.text}</span>
                  ),
                )}
              </p>
              {item.rejected.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">Citation écartée, introuvable mot pour mot : {item.rejected.map((quote) => `« ${quote} »`).join(", ")}</p>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">
                <Link href={item.href} className="underline underline-offset-2 hover:text-foreground">
                  Ouvrir dans les feedbacks
                </Link>
                <span className="mt-1 block font-mono">{item.id}</span>
              </p>
            </AccordionPanel>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
