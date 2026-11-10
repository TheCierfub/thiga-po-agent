import { signOut } from "@/app/actions";
import { readAccess } from "@/lib/etai/access";
import Link from "next/link";

export async function SessionMenu() {
  const { email } = await readAccess();
  if (!email) {
    return (
      <Link href="/connexion" className="text-xs text-muted-foreground hover:text-foreground">
        Se connecter
      </Link>
    );
  }
  return (
    <form action={signOut} className="flex items-center gap-2">
      <span className="max-w-48 truncate text-xs text-muted-foreground">{email}</span>
      <button type="submit" className="text-xs text-foreground hover:underline">
        Se déconnecter
      </button>
    </form>
  );
}

export function SessionMenuFallback() {
  return <span className="inline-flex h-4 w-24 animate-pulse rounded bg-muted" />;
}
