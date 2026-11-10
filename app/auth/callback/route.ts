import { NextResponse } from "next/server";
import { isAllowedEmail, parseAllowedEmails, safeNextPath } from "@/core/auth/gate";
import { readActor } from "@/lib/etai/access";
import { createSupabaseServer } from "@/lib/etai/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const back = new URL("/connexion", url.origin);
  if (!code) return NextResponse.redirect(back);
  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.redirect(back);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(back);
  const actor = await readActor();
  if (!actor || !isAllowedEmail(actor.email, parseAllowedEmails(process.env.ALLOWED_EMAILS))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
