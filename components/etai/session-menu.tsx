import { leaveAccess } from "@/app/actions";
import { readAccess } from "@/lib/etai/access";

export async function SessionMenu() {
  const { canSpend } = await readAccess();
  if (!canSpend) return null;
  return (
    <form action={leaveAccess}>
      <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
        Quitter
      </button>
    </form>
  );
}

export function SessionMenuFallback() {
  return <span className="inline-flex h-4 w-16 animate-pulse rounded bg-muted" />;
}
