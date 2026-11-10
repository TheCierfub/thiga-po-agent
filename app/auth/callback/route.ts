import { NextResponse } from "next/server";
import { authCallbackLocation } from "@/core/auth/origin";
import { readActor } from "@/lib/etai/access";
import { readPublicOrigin } from "@/lib/etai/public-origin";
import { createSupabaseServer } from "@/lib/etai/supabase-server";

/**
 * Échange le code PKCE. Le proxy ne passe pas ici : il réécrirait les cookies
 * et retirerait le code verifier avant cet échange. Les redirections utilisent
 * l'origine publique, pas request.url (0.0.0.0:10000 sur Render).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = await readPublicOrigin(url.origin);
  const next = url.searchParams.get("next");
  const fail = () => NextResponse.redirect(authCallbackLocation({ origin, next, ok: false }));
  const code = url.searchParams.get("code");
  if (!code) return fail();
  const supabase = await createSupabaseServer();
  if (!supabase) return fail();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail();
  const actor = await readActor();
  if (!actor) {
    await supabase.auth.signOut();
    return fail();
  }
  return NextResponse.redirect(authCallbackLocation({ origin, next, ok: true }));
}
