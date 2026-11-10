"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chooseLinearTeam, disconnectLinearSession, verifyLinearKey } from "@/app/actions";
import { LinearMark } from "@/components/etai/linear-mark";
import { Button } from "@/components/ui/button";
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
}: {
  connected: boolean;
  source: "session" | "default" | "aucune";
  teamName: string | null;
  workspaceName: string | null;
  teamKey: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; key: string; name: string }[] | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const label = connected && teamName && workspaceName
    ? `Linear connecté · ${teamName} · ${workspaceName}`
    : connected
      ? "Linear connecté"
      : source === "aucune"
        ? "Connecter Linear"
        : "Linear déconnecté";
  const hint = connected
    ? `Espace ${workspaceName ?? "inconnu"}, équipe ${teamName ?? teamKey ?? "inconnue"}.`
    : source === "aucune"
      ? "Aucune clé sur ce serveur. Connecter un compte Linear personnel."
      : "Linear ne répond pas. Rien n'est envoyé.";

  function resetForm() {
    setApiKey("");
    setError(null);
    setTeams(null);
    setWorkspace(null);
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
      setWorkspace(result.workspaceName);
      setTeams(result.teams);
    });
  }

  function choose(teamId: string) {
    setError(null);
    start(async () => {
      const result = await chooseLinearTeam(teamId);
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
                "inline-flex h-7 max-w-[min(100%,28rem)] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs",
                connected ? "border-ok-fg/30 bg-ok-bg text-foreground" : "text-muted-foreground",
              )}
            />
          }
        >
          <span className={connected ? "size-1.5 shrink-0 rounded-full bg-ok-fg" : "size-1.5 shrink-0 rounded-full bg-muted-foreground"} />
          <LinearMark className={connected ? "size-3.5 shrink-0" : "size-3.5 shrink-0 opacity-45"} />
          <span className="truncate">{label}</span>
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
        {connected && source === "session" ? (
          <p className="text-sm text-muted-foreground">
            Connecté{teamKey ? ` · ${teamKey}` : ""}{teamName ? ` · ${teamName}` : ""}{workspaceName ? ` · ${workspaceName}` : ""}.
          </p>
        ) : null}
        {teams ? (
          <div className="space-y-2">
            <p className="text-sm">Choisissez l&apos;équipe de destination{workspace ? ` dans ${workspace}` : ""}.</p>
            <ul className="space-y-2">
              {teams.map((team) => (
                <li key={team.id}>
                  <Button type="button" variant="outline" className="w-full justify-start" disabled={pending} onClick={() => choose(team.id)}>
                    {team.name} · {team.key}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
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
