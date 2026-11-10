"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { chooseLinearTeam, disconnectLinearSession, requestMagicLink, verifyLinearKey } from "@/app/actions";
import { magicLinkPanel, type MagicLinkDraft } from "@/core/auth/magic-sent";
import { linearAccountLine } from "@/core/linear/badge";
import type { LinearTeamChoice } from "@/core/linear/connect";
import { presentLinear, withKeyStep, type LinearView } from "@/core/linear/present";
import { chosenTeamId, teamMatches, teamOptionLabel } from "@/core/linear/teams";
import { LinearHeaderBadge } from "@/components/etai/linear-badge";
import { MagicLinkSent } from "@/components/etai/magic-link-sent";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MAGIC_DRAFT_KEY = "etai-magic-link";
const draftListeners = new Set<() => void>();

function notifyMagicDraft() {
  for (const listener of draftListeners) listener();
}

function magicDraftSnapshot() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(MAGIC_DRAFT_KEY) ?? "";
}

function subscribeMagicDraft(listener: () => void) {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
}

function parseMagicDraft(raw: string): MagicLinkDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as MagicLinkDraft;
    if (!value.email?.trim() || !value.sentAt) return null;
    return { email: value.email.trim(), sentAt: value.sentAt };
  } catch {
    return null;
  }
}

function writeMagicDraft(draft: MagicLinkDraft | null) {
  if (draft) sessionStorage.setItem(MAGIC_DRAFT_KEY, JSON.stringify(draft));
  else sessionStorage.removeItem(MAGIC_DRAFT_KEY);
  notifyMagicDraft();
}

export function LinearConnect({
  hasSession,
  source,
  teamName,
  workspaceName,
  teamKey,
  teamId,
  viewerName,
}: {
  hasSession: boolean;
  source: "session" | "default" | "aucune";
  teamName: string | null;
  workspaceName: string | null;
  teamKey: string | null;
  teamId: string | null;
  viewerName: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("etape");
  const view = presentLinear({
    hasSession,
    personalKey: source === "session",
    team: { name: teamName, key: teamKey, workspaceName },
    requestedStep: requested,
  });
  const [open, setOpen] = useState(view.reopen);
  const [phase, setPhase] = useState<LinearView["phase"]>(view.phase);
  const [email, setEmail] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const draft = parseMagicDraft(useSyncExternalStore(subscribeMagicDraft, magicDraftSnapshot, () => ""));
  const sent = magicLinkPanel(draft, now);
  const waitingResend = sent.mode === "sent" && !sent.canResend;
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<LinearTeamChoice[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accountWorkspace, setAccountWorkspace] = useState<string | null>(null);
  const [accountViewer, setAccountViewer] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selected = useMemo(() => teams?.find((team) => team.id === selectedId) ?? null, [teams, selectedId]);
  const accountLine = linearAccountLine(accountWorkspace ?? (source === "session" ? workspaceName : null), accountViewer ?? (source === "session" ? viewerName : null));

  useEffect(() => {
    if (!waitingResend) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [waitingResend]);

  useEffect(() => {
    if (!view.reopen) return;
    const next = new URLSearchParams(params.toString());
    next.delete("etape");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [view.reopen, params, pathname, router]);

  function resetForm() {
    setEmail("");
    setApiKey("");
    setError(null);
    setTeams(null);
    setSelectedId(null);
    setAccountWorkspace(null);
    setAccountViewer(null);
  }

  function sendLink() {
    setError(null);
    start(async () => {
      const here = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      const result = await requestMagicLink(email, withKeyStep(here));
      if (result.ok) {
        const sentAt = Date.now();
        writeMagicDraft({ email: email.trim(), sentAt });
        setNow(sentAt);
        return;
      }
      setError(result.message);
    });
  }

  function resend() {
    if (!draft) return;
    setError(null);
    start(async () => {
      const here = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      const result = await requestMagicLink(draft.email, withKeyStep(here));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const sentAt = Date.now();
      writeMagicDraft({ email: draft.email, sentAt });
      setNow(sentAt);
    });
  }

  function verify() {
    setError(null);
    start(async () => {
      const result = await verifyLinearKey(apiKey);
      setApiKey("");
      if (!result.ok) {
        setTeams(null);
        setError(result.message);
        return;
      }
      setAccountWorkspace(result.workspaceName);
      setAccountViewer(result.viewerName);
      setTeams(result.teams);
      setSelectedId(chosenTeamId(result.teams, teamId));
    });
  }

  function choose() {
    if (!selectedId) return;
    setError(null);
    start(async () => {
      const result = await chooseLinearTeam(selectedId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      resetForm();
      router.refresh();
    });
  }

  function disconnect() {
    start(async () => {
      await disconnectLinearSession();
      setOpen(false);
      resetForm();
      router.refresh();
    });
  }

  const step = phase === "compte" ? "1/2" : phase === "cle" ? "2/2" : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPhase(view.phase);
        else resetForm();
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger className="cursor-pointer bg-transparent p-0 text-foreground" />
          }
        >
          <LinearHeaderBadge view={view} />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-72 leading-relaxed">
          {view.hint}
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{phase === "gestion" ? "Votre Linear" : "Connecter Linear"}</DialogTitle>
          <DialogDescription>
            {phase === "cle" || phase === "gestion"
              ? "La clé reste dans ce navigateur, chiffrée, et n'est jamais enregistrée en base. Pour un essai : Read, Create issues et Create comments. "
              : "Un lien de connexion ouvre ensuite la saisie de la clé. "}
            {phase === "cle" || phase === "gestion" ? (
              <a href="https://linear.app/settings/account/security" target="_blank" rel="noreferrer">
                Créer une clé
              </a>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {step ? <p className="text-xs text-muted-foreground">Étape {step}</p> : null}
        {accountLine ? <p className="text-sm text-muted-foreground">{accountLine}</p> : null}
        {phase === "compte" && sent.mode === "sent" ? (
          <MagicLinkSent
            email={sent.email}
            resendIn={sent.resendIn}
            canResend={sent.canResend}
            pending={pending}
            onChange={() => {
              writeMagicDraft(null);
              setEmail("");
            }}
            onResend={resend}
          />
        ) : null}
        {phase === "compte" && sent.mode === "form" ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              sendLink();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="linear-email">Adresse e-mail</Label>
              <Input id="linear-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <Button type="submit" disabled={pending || email.trim().length < 3}>
              {pending ? "Envoi" : "Recevoir un lien de connexion"}
            </Button>
          </form>
        ) : null}
        {phase === "cle" && !teams ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              verify();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="linear-key">Clé d&apos;API personnelle Linear</Label>
              <Input id="linear-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            </div>
            <Button type="submit" disabled={pending || apiKey.trim().length < 8}>
              {pending ? "Vérification" : "Vérifier la clé"}
            </Button>
          </form>
        ) : null}
        {phase === "cle" && teams ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              choose();
            }}
          >
            <div className="space-y-1.5">
              <Label>Équipe de destination{accountWorkspace ? ` dans ${accountWorkspace}` : ""}</Label>
              <Combobox
                items={teams}
                value={selected}
                onValueChange={(value) => setSelectedId(value?.id ?? null)}
                itemToStringLabel={(team) => teamOptionLabel(team)}
                isItemEqualToValue={(item, value) => item.id === value.id}
                filter={(team, query) => teamMatches(team, query)}
              >
                <ComboboxInput placeholder="Rechercher par nom ou par clé" />
                <ComboboxContent>
                  <ComboboxEmpty>Aucune équipe.</ComboboxEmpty>
                  <ComboboxList>
                    {(team: LinearTeamChoice) => (
                      <ComboboxItem key={team.id} value={team}>
                        {teamOptionLabel(team)}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <Button type="submit" disabled={pending || !selectedId}>
              Utiliser cette équipe
            </Button>
          </form>
        ) : null}
        {phase === "gestion" ? (
          <div className="flex flex-col items-start gap-2">
            <Button type="button" variant="outline" onClick={() => setPhase("cle")}>
              Changer d&apos;équipe
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={disconnect}>
              Déconnecter
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-sm text-warn-fg">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
