"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const Arrived = createContext<ReadonlySet<string>>(new Set());

/** Rafraîchit la liste sans interroger X. Un feedback apparu depuis l’ouverture est signalé une fois. */
export function ArrivalWatch({
  ids,
  intervalMs,
  children,
}: {
  ids: string[];
  intervalMs: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seen.current?.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seen.current.add(id);
    setArrived((current) => new Set([...current, ...fresh]));
    toast(fresh.length === 1 ? "Nouveau feedback" : `${fresh.length} nouveaux feedbacks`);
  }, [ids]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    if (intervalMs <= 0) return;
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return <Arrived.Provider value={arrived}>{children}</Arrived.Provider>;
}

export function ArrivalItem({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const arrived = useContext(Arrived);
  const fresh = arrived.has(id);
  return (
    <li id={id} className={cn(className, fresh && "ring-1 ring-foreground/15")}>
      {fresh ? <span className="mb-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">Nouveau</span> : null}
      {children}
    </li>
  );
}
