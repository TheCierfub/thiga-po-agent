"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { highlightQuotes } from "@/lib/etai/labels";

export interface SourceItem {
  id: string;
  caption: string;
  excerpt: string;
  body: string;
  quotes: string[];
  rejected: string[];
  when: string;
  channel: string;
  who: string;
  href: string;
  note: string | null;
}

export function SourceList({ items }: { items: SourceItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {items.map((item) => (
        <li key={item.id}>
          <Sheet>
            <SheetTrigger className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/40">
              <span className="text-sm font-medium" title={item.id}>
                {item.caption}
              </span>
              <span className="line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</span>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{item.caption}</SheetTitle>
                <SheetDescription>
                  {item.when} · {item.channel} · {item.who}
                  {item.note ? ` · ${item.note}` : ""}
                </SheetDescription>
              </SheetHeader>
              <p className="text-sm leading-relaxed whitespace-pre-line">
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
                <p className="text-xs text-muted-foreground">Citation écartée, introuvable mot pour mot : {item.rejected.map((quote) => `« ${quote} »`).join(", ")}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                <Link href={item.href} className="underline underline-offset-2 hover:text-foreground" title={item.id}>
                  Ouvrir dans les feedbacks
                </Link>
                <span className="mt-1 block font-mono">{item.id}</span>
              </p>
            </SheetContent>
          </Sheet>
        </li>
      ))}
    </ul>
  );
}
