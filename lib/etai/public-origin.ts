import { headers } from "next/headers";
import { getPublicOrigin } from "@/core/auth/origin";

/** Origine du navigateur. Jamais l'hôte interne de Render. */
export async function readPublicOrigin(requestOrigin?: string | null): Promise<string | null> {
  const headerStore = await headers();
  return getPublicOrigin({
    configuredUrl: process.env.ETAI_PUBLIC_URL,
    forwardedHost: headerStore.get("x-forwarded-host"),
    forwardedProto: headerStore.get("x-forwarded-proto"),
    requestOrigin,
    nodeEnv: process.env.NODE_ENV,
  });
}
