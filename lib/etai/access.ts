import { authorizeSpend, parseAllowedEmails, type Actor, type Gate } from "@/core/auth/gate";
import { createSupabaseServer } from "@/lib/etai/supabase-server";

/** Adresse vérifiée par la signature du jeton. Jamais le cookie lu tel quel. */
export async function readActor(): Promise<Actor | null> {
  const supabase = await createSupabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const email = data.claims.email;
  if (typeof email !== "string") return null;
  return { email };
}

export async function requireSpend(): Promise<Gate> {
  return authorizeSpend(await readActor(), parseAllowedEmails(process.env.ALLOWED_EMAILS));
}

export async function readAccess(): Promise<{ email: string | null; canSpend: boolean }> {
  const gate = await requireSpend();
  return { email: gate.ok ? gate.email : null, canSpend: gate.ok };
}
