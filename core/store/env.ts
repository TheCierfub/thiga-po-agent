/** Lu côté serveur uniquement. Ne jamais préfixer ces noms par NEXT_PUBLIC_. */
export function readSupabaseConfig(env: NodeJS.ProcessEnv = process.env): { url: string; key: string } | null {
  const url = env.SUPABASE_URL?.trim() ?? "";
  const key = env.SUPABASE_KEY?.trim() ?? "";
  if (!url || !key) return null;
  return { url, key };
}
