import { allowMagicLink, readQuotaNumber, type MagicAttempt } from "@/core/auth/quota";

const HOUR = 60 * 60 * 1000;
let history: MagicAttempt[] = [];

/** Mémoire du processus, en plus de la limite d'envoi de Supabase. */
export function takeMagicLink(email: string, ip: string, now = Date.now()): { ok: true } | { ok: false; message: string } {
  const result = allowMagicLink({
    email,
    ip,
    now,
    history,
    emailLimit: readQuotaNumber(process.env.QUOTA_MAGIC_EMAIL, 5),
    ipLimit: readQuotaNumber(process.env.QUOTA_MAGIC_IP, 20),
    windowMs: HOUR,
  });
  history = result.history;
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}
