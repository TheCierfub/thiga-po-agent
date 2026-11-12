"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chooseLinearTeam, disconnectLinearSession, verifyLinearKey } from "@/app/actions";
import { linearAccountLine } from "@/core/linear/badge";
import type { LinearTeamChoice } from "@/core/linear/connect";
import { presentLinear, type LinearView } from "@/core/linear/present";
import { chosenTeamId, teamMatches, teamOptionLabel } from "@/core/linear/teams";
import { LinearHeaderBadge } from "@/components/etai/linear-badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function LinearConnect({
  source,
  teamName,
  workspaceName,
  teamKey,
  teamId,
  viewerName,
}: {
  source: "session" | "default" | "aucune";
  teamName: string | null;
  workspaceName: string | null;
  teamKey: string | null;
  teamId: string | null;
  viewerName: string | null;
}) {
  const router = useRouter();
  const view = presentLinear({
    personalKey: source === "session",
    team: { name: teamName, key: teamKey, workspaceName },
  });
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<LinearView["phase"]>(view.phase);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<LinearTeamChoice[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accountWorkspace, setAccountWorkspace] = useState<string | null>(null);
  const [accountViewer, setAccountViewer] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selected = useMemo(() => teams?.find((team) => team.id === selectedId) ?? null, [teams, selectedId]);
  const accountLine = linearAccountLine(accountWorkspace ?? (source === "session" ? workspaceName : null), accountViewer ?? (source === "session" ? viewerName : null));

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPhase(view.phase);
        else resetForm();
      }}
    >
      <Tooltip>
        <TooltipTrigger render={<DialogTrigger className="cursor-pointer bg-transparent p-0 text-foreground" />}>
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
            La clé reste dans ce navigateur, chiffrée, et n&apos;est jamais enregistrée en base. Pour un essai : Read, Create issues et Create comments.{" "}
            <a href="https://linear.app/settings/account/security" target="_blank" rel="noreferrer">
              Créer une clé
            </a>
          </DialogDescription>
        </DialogHeader>
        {accountLine ? <p className="text-sm text-muted-foreground">{accountLine}</p> : null}
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
