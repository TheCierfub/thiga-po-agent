import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Client Auth du serveur. La clé publishable ne part pas au navigateur. */
export async function createSupabaseServer() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_KEY?.trim();
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch (error) {
          // Sans le code verifier, le lien magique ne peut pas être échangé.
          if (cookiesToSet.some((cookie) => cookie.name.includes("code-verifier"))) throw error;
          // Un Server Component ne peut pas écrire les cookies. Le proxy s'en charge.
        }
      },
    },
  });
}
