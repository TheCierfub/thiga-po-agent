import { cookies, headers } from "next/headers";
import {
  LINEAR_PENDING_COOKIE,
  LINEAR_SESSION_COOKIE,
  type CookieJar,
} from "@/core/linear/connect";
import { linearCookieKey } from "@/core/linear/seal";

export function readLinearCookieSecret(): Buffer | null {
  return linearCookieKey(process.env.LINEAR_KEY_COOKIE_SECRET);
}

/** Secure dès que la page est servie en HTTPS, donc sur Render. En local HTTP le cookie doit pouvoir être posé. */
export async function secureCookie(): Promise<boolean> {
  const proto = (await headers()).get("x-forwarded-proto");
  return proto === "https" || process.env.NODE_ENV === "production";
}

export async function linearCookieJar(): Promise<CookieJar> {
  const store = await cookies();
  const secure = await secureCookie();
  const write = (name: string, value: string, maxAge: number) => {
    store.set(name, value, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  };
  return {
    get: (name) => store.get(name)?.value,
    set: write,
    delete: (name) => store.delete(name),
  };
}

export async function currentLinearToken(): Promise<string | undefined> {
  return (await cookies()).get(LINEAR_SESSION_COOKIE)?.value;
}

export { LINEAR_PENDING_COOKIE, LINEAR_SESSION_COOKIE };
