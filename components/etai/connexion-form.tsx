"use client";

import { useState, useTransition, type FormEvent } from "react";
import { requestMagicLink } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConnexionForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await requestMagicLink(email, nextPath);
      setFailed(!result.ok);
      setNotice(result.message);
      if (result.ok) setEmail("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="connexion-email">Adresse e-mail</Label>
        <Input
          id="connexion-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || email.trim().length < 3}>
        {pending ? "Envoi" : "Recevoir un lien de connexion"}
      </Button>
      {notice ? <p className={failed ? "text-sm text-warn-fg" : "text-sm text-muted-foreground"}>{notice}</p> : null}
    </form>
  );
}
