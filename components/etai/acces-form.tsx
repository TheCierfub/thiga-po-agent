"use client";

import { useState, useTransition, type FormEvent } from "react";
import { unlockAccess } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccesForm({ nextPath }: { nextPath: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await unlockAccess(code, nextPath);
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="access-code">Code d&apos;accès</Label>
        <Input id="access-code" type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} />
      </div>
      <Button type="submit" disabled={pending || code.trim().length === 0}>
        {pending ? "Vérification" : "Entrer"}
      </Button>
      {error ? <p className="text-sm text-warn-fg">{error}</p> : null}
    </form>
  );
}
