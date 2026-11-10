"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chooseLinearTeam, disconnectLinearSession, verifyLinearKey } from "@/app/actions";
import { linearAccountLine, linearBadgeHint } from "@/core/linear/badge";
import { chosenTeamId, teamMatches, teamOptionLabel } from "@/core/linear/teams";
import type { LinearTeamChoice } from "@/core/linear/connect";
import { LinearHeaderBadge } from "@/components/etai/linear-badge";
import { LinearMark } from "@/components/etai/linear-mark";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function LinearConnect({
  connected,
  source,
  teamName,
  workspaceName,
  teamKey,
  teamId,
  viewerName,
}: {
  connected: boolean;
  source: "session" | "default" | "aucune";
  teamName: string | null;
  workspaceName: string | null;
  teamKey: string | null;
  teamId: string | null;
  viewerName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<LinearTeamChoice[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accountWorkspace, setAccountWorkspace] = useState<string | null>(null);
  const [accountViewer, setAccountViewer] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const activeTeam = connected ? { name: teamName, key: teamKey, workspaceName } : null;
  const labelTeam = connected ? activeTeam : null;
  const hint = connected ? linearBadgeHint(activeTeam) || "Linear connecté." : source === "aucune" ? "Aucune clé sur ce serveur. Connecter un compte Linear personnel." : "Linear ne répond pas. Rien n'est envoyé.";
  const disconnectedLabel = source === "aucune" ? "Connecter Linear" : "Linear déconnecté";
  const accountLine = linearAccountLine(accountWorkspace ?? workspaceName, accountViewer ?? viewerName);
  const selected = useMemo(() => teams?.find((team) => team.id === selectedId) ?? null, [teams, selectedId]);

  function resetForm() {
    setApiKey("");
    setError(null);
    setTeams(null);
    setSelectedId(null);
    setAccountWorkspace(null);
    setAccountViewer(null);
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

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              className={cn(
                "inline-flex h-7 max-w-[min(100%,18rem)] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs",
                connected ? "border-ok-fg/30 bg-ok-bg text-foreground" : "text-muted-foreground",
              )}
            />
          }
        >
          <span className={connected ? "size-1.5 shrink-0 rounded-full bg-ok-fg" : "size-1.5 shrink-0 rounded-full bg-muted-foreground"} />
          <LinearMark className={connected ? "size-3.5 shrink-0" : "size-3.5 shrink-0 opacity-45"} />
          {connected ? <LinearHeaderBadge team={labelTeam} /> : <span className="truncate">{disconnectedLabel}</span>}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-72 leading-relaxed">
          {hint}
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connecter Linear</DialogTitle>
          <DialogDescription>
            La clé reste dans ce navigateur, chiffrée, et n&apos;est jamais enregistrée en base.{" "}
            <a href="https://linear.app/settings/account/security" target="_blank" rel="noreferrer">
              Créer une clé
            </a>
          </DialogDescription>
        </DialogHeader>
        {accountLine ? <p className="text-sm text-muted-foreground">{accountLine}</p> : null}
        {teams ? (
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
        ) : (
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
              {pending ? "Vérification" : "Connecter Linear"}
            </Button>
          </form>
        )}
        {error ? <p className="text-sm text-warn-fg">{error}</p> : null}
        {source === "session" ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={disconnect}>
            Déconnecter
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
