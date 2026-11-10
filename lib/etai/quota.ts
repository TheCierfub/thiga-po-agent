import { QUOTA_REACHED, limitsFor, quotaFor, usageDay, type UsageAction } from "@/core/auth/quota";
import { createSupabaseServer } from "@/lib/etai/supabase-server";

export const QUOTA_UNAVAILABLE = "Le plafond du jour n'a pas pu être vérifié.";

/** Réserve une unité dans usage_counters. La fonction SQL est la source atomique. */
export async function consumeQuota(action: UsageAction): Promise<{ ok: true } | { ok: false; status: 429 | 503; message: string }> {
  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, status: 503, message: QUOTA_UNAVAILABLE };
  const bounds = quotaFor(action, limitsFor(process.env));
  const { data, error } = await supabase.rpc("consume_quota", {
    p_action: action,
    p_day: usageDay(new Date()),
    p_user_limit: bounds.user,
    p_global_limit: bounds.global,
  });
  if (error || typeof data !== "number") return { ok: false, status: 503, message: QUOTA_UNAVAILABLE };
  if (data < 0) return { ok: false, status: 429, message: QUOTA_REACHED };
  return { ok: true };
}
