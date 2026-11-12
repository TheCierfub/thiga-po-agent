import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessCookie, ACCESS_COOKIE, ACCESS_REQUIRED } from "@/core/auth/access-code";
import { getPublicOrigin } from "@/core/auth/origin";
import { safeNextPath } from "@/core/auth/gate";

function isPublic(pathname: string): boolean {
  return pathname === "/acces" || pathname === "/floorplan.html";
}

/** Tout le site exige le cookie d'accès. /floorplan.html et /acces restent ouverts. */
export function proxy(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();
  const ok = verifyAccessCookie(request.cookies.get(ACCESS_COOKIE)?.value, process.env.ACCESS_COOKIE_SECRET);
  if (ok) return NextResponse.next();
  if (request.headers.has("next-action") || request.headers.get("accept")?.includes("application/json")) {
    return NextResponse.json({ ok: false, message: ACCESS_REQUIRED }, { status: 401 });
  }
  const origin = getPublicOrigin({
    configuredUrl: process.env.ETAI_PUBLIC_URL,
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    requestOrigin: request.nextUrl.origin,
    nodeEnv: process.env.NODE_ENV,
  });
  const next = safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  const target = origin ? new URL(`/acces?next=${encodeURIComponent(next)}`, origin) : new URL(`/acces?next=${encodeURIComponent(next)}`, "http://localhost:43217");
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
