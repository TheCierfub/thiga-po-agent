import { cookies } from "next/headers";
import { ACCESS_COOKIE, ACCESS_REQUIRED, verifyAccessCookie } from "@/core/auth/access-code";

export async function hasAccess(): Promise<boolean> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return verifyAccessCookie(token, process.env.ACCESS_COOKIE_SECRET);
}

export async function requireAccess(): Promise<{ ok: true } | { ok: false; status: 401; message: string }> {
  if (await hasAccess()) return { ok: true };
  return { ok: false, status: 401, message: ACCESS_REQUIRED };
}

export async function readAccess(): Promise<{ canSpend: boolean }> {
  return { canSpend: await hasAccess() };
}
