import type { IngestTrace } from "../pipeline/ingest-trace";
import { LIVE_BATCH } from "../pipeline/direct";
import { FeedbackSchema, type Feedback } from "../schemas";
import {
  DEFAULT_MAX_AGE_DAYS,
  MAX_POSTS_PER_POLL,
  capMicro,
  delayMs,
  resolveSince,
} from "./x-listen";

/** AnyAPI en direct, tri du plus récent au plus ancien. Le routé ne sait pas forcer Latest. */
export const ANYAPI_SEARCH_URL = "https://treg.to/call/anyapi.x.search.posts";
export const ROUTED_SEARCH_URL = "https://treg.to/call/treg.x.search.posts";
export const TREG_MAX_COST_USD = "0.02";

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export class TregError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "TregError";
    this.status = status;
    this.code = code;
  }
}

export interface XPost {
  id: string | null;
  text: string | null;
  handle: string | null;
  authorName: string | null;
  publishedAt: string | null;
  url: string | null;
  retweet: boolean;
  language: "fr" | "en" | null;
}

export interface TregCallTrace {
  callId: string | null;
  servedBy: string | null;
  costMicro: number | null;
}

export interface IgnoredXPost {
  postId: string | null;
  reason: "sans_id" | "sans_texte" | "repost" | "date_absente" | "trop_ancien" | "avant_ecoute" | "deja_ingere" | "plafond_passage";
}

export interface FreshXPost {
  post: XPost & { id: string; text: string; publishedAt: string };
  feedback: Feedback;
}

export interface PollPostResult {
  feedbackId: string;
  handle: string | null;
  url: string | null;
  publishedAt: string;
  detectedAt: string;
  processedAt: string;
  indexDelayMs: number;
  processDelayMs: number;
  quarantined: boolean;
  trace: IngestTrace;
}

export interface PollXResult {
  found: number;
  created: PollPostResult[];
  ignored: IgnoredXPost[];
  errors: string[];
  treg: TregCallTrace;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function dig(root: unknown, path: readonly string[]): unknown {
  let current = root;
  for (const key of path) {
    const bag = record(current);
    if (!bag || !(key in bag)) return undefined;
    current = bag[key];
  }
  return current;
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}

function firstText(root: unknown, paths: readonly (readonly string[])[]): string | null {
  for (const path of paths) {
    const text = asText(dig(root, path));
    if (text) return text;
  }
  return null;
}

function bareHandle(value: string | null): string | null {
  if (!value) return null;
  const handle = value.replace(/^@+/, "").trim();
  return handle || null;
}

/** Date ISO, date Twitter (`Mon Nov 09 18:00:00 +0000 2026`) ou horodatage unix. */
export function parsePostedAt(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  if (/^\d{10,13}$/.test(text)) {
    const ms = text.length === 13 ? Number(text) : Number(text) * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const twitter = text.match(/^[A-Za-z]{3} ([A-Za-z]{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) \+0000 (\d{4})$/);
  if (twitter) {
    const month = MONTHS[twitter[1] ?? ""];
    if (month === undefined) return null;
    const date = new Date(Date.UTC(Number(twitter[6]), month, Number(twitter[2]), Number(twitter[3]), Number(twitter[4]), Number(twitter[5])));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function isRetweet(root: unknown, text: string | null): boolean {
  const bag = record(root);
  if (!bag) return false;
  if (bag.is_retweet === true || bag.isRetweet === true || bag.retweeted_status || bag.retweeted_status_result) return true;
  const legacy = record(bag.legacy);
  if (legacy?.retweeted_status || legacy?.retweeted_status_result) return true;
  return Boolean(text && /^RT @/i.test(text));
}

const ID_PATHS = [["id"], ["id_str"], ["rest_id"], ["tweet_id"], ["legacy", "id_str"], ["tweet", "id"], ["data", "id"]] as const;
const TEXT_PATHS = [["text"], ["full_text"], ["fullText"], ["legacy", "full_text"], ["content"], ["tweet", "text"], ["tweet", "full_text"]] as const;
const HANDLE_PATHS = [
  ["authorUsername"],
  ["author", "userName"],
  ["author", "username"],
  ["author", "screen_name"],
  ["user", "screen_name"],
  ["user", "username"],
  ["screen_name"],
  ["username"],
  ["core", "user_results", "result", "legacy", "screen_name"],
  ["core", "user_results", "result", "core", "screen_name"],
] as const;
const NAME_PATHS = [
  ["authorName"],
  ["author", "name"],
  ["user", "name"],
  ["core", "user_results", "result", "legacy", "name"],
  ["core", "user_results", "result", "core", "name"],
] as const;
const DATE_PATHS = [["createdUtc"], ["createdAt"], ["created_at"], ["legacy", "created_at"], ["tweet", "created_at"], ["tweet", "createdAt"]] as const;
const URL_PATHS = [["url"], ["tweet_url"], ["twitterUrl"], ["tweet", "url"]] as const;

/** Normalise une ligne anyapi, tikhub ou justoneapi. Un champ absent reste nul, sans erreur. */
export function normalizeXPost(raw: unknown): XPost {
  const id = firstText(raw, ID_PATHS);
  const text = firstText(raw, TEXT_PATHS);
  const handle = bareHandle(firstText(raw, HANDLE_PATHS));
  const authorName = firstText(raw, NAME_PATHS);
  const publishedAt = parsePostedAt(firstText(raw, DATE_PATHS) ?? dig(raw, ["created_at"]) ?? dig(raw, ["legacy", "created_at"]));
  const explicitUrl = firstText(raw, URL_PATHS);
  const url = explicitUrl ?? (handle && id ? `https://x.com/${handle}/status/${id}` : null);
  const lang = firstText(raw, [["lang"]])?.toLowerCase();
  const language = lang === "fr" || lang === "en" ? lang : null;
  return { id, text, handle, authorName, publishedAt, url, retweet: isRetweet(raw, text), language };
}

/** Français si un accent ou un mot courant est là, anglais sinon, français par défaut. */
export function detectLanguage(text: string): "fr" | "en" {
  if (/[àâäçéèêëîïôùûüœ]/i.test(text) || /\b(le|la|les|des|une|est|pas|pour|avec|dans|que|qui|sur)\b/i.test(text)) return "fr";
  if (/\b(the|and|with|this|that|from|your|have|not|for)\b/i.test(text)) return "en";
  return "fr";
}

export function feedbackIdForPost(postId: string): string | null {
  const safe = postId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return safe ? `fb-x-${safe}` : null;
}

export function feedbackFromXPost(post: XPost & { id: string; text: string; publishedAt: string }, detectedAt: Date): Feedback {
  const handle = post.handle ? `@${post.handle}` : null;
  const id = feedbackIdForPost(post.id);
  if (!id) throw new Error("Identifiant de post illisible.");
  return FeedbackSchema.parse({
    id,
    batch: LIVE_BATCH,
    channel: "social",
    receivedAt: post.publishedAt,
    author: {
      name: handle ?? post.authorName,
      email: null,
      handle,
      anonymous: handle === null && !post.authorName,
    },
    sourceAccountId: handle ? `x:${handle}` : null,
    language: post.language ?? detectLanguage(post.text),
    text: post.text,
    sourceUrl: post.url,
    listening: {
      publishedAt: post.publishedAt,
      detectedAt: detectedAt.toISOString(),
      processedAt: null,
    },
  });
}

export function selectFreshPosts(input: {
  posts: XPost[];
  existingIds: ReadonlySet<string>;
  since: Date;
  now: Date;
  maxAgeDays?: number;
}): { fresh: FreshXPost[]; ignored: IgnoredXPost[] } {
  const maxAgeMs = (input.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
  const fresh: FreshXPost[] = [];
  const ignored: IgnoredXPost[] = [];
  for (const post of input.posts) {
    const postId = post.id;
    const reason = ignoreReason(post, input.existingIds, input.since, input.now, maxAgeMs);
    if (reason) {
      ignored.push({ postId, reason });
      continue;
    }
    const ready = post as XPost & { id: string; text: string; publishedAt: string };
    fresh.push({ post: ready, feedback: feedbackFromXPost(ready, input.now) });
  }
  fresh.sort((a, b) => b.post.publishedAt.localeCompare(a.post.publishedAt));
  const kept = fresh.slice(0, MAX_POSTS_PER_POLL);
  for (const extra of fresh.slice(MAX_POSTS_PER_POLL)) {
    ignored.push({ postId: extra.post.id, reason: "plafond_passage" });
  }
  return { fresh: kept, ignored };
}

function ignoreReason(post: XPost, existingIds: ReadonlySet<string>, since: Date, now: Date, maxAgeMs: number): IgnoredXPost["reason"] | null {
  if (!post.id || !feedbackIdForPost(post.id)) return "sans_id";
  if (!post.text) return "sans_texte";
  if (post.retweet) return "repost";
  if (!post.publishedAt) return "date_absente";
  const published = Date.parse(post.publishedAt);
  if (Number.isNaN(published)) return "date_absente";
  if (now.getTime() - published > maxAgeMs) return "trop_ancien";
  if (published < since.getTime()) return "avant_ecoute";
  if (existingIds.has(feedbackIdForPost(post.id)!)) return "deja_ingere";
  return null;
}

function header(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim();
  return value || null;
}

function errorCode(body: unknown): string | null {
  const bag = record(body);
  const code = bag?.error ?? bag?.code;
  return typeof code === "string" ? code : null;
}

function failure(status: number, code: string | null): TregError {
  if (status === 401) return new TregError("Jeton Treg refusé.", 401, code);
  if (status === 402 && code === "insufficient_balance") return new TregError("Solde Treg insuffisant.", 402, code);
  if (status === 402 && code === "route_max_cost") return new TregError("La recherche dépasse le plafond de 0,02 $.", 402, code);
  if (status === 402) return new TregError("Recherche X refusée.", 402, code);
  return new TregError(`Recherche X indisponible (${status}).`, status, code);
}

/** Premier tableau d'objets qui portent un champ `text`, quel que soit le chemin. */
export function findTextPosts(root: unknown): unknown[] | null {
  if (Array.isArray(root)) {
    const objects = root.filter((item): item is Record<string, unknown> => record(item) !== null);
    if (objects.some((item) => typeof item.text === "string")) return objects;
    for (const item of root) {
      const found = findTextPosts(item);
      if (found) return found;
    }
    return null;
  }
  const bag = record(root);
  if (!bag) return null;
  for (const value of Object.values(bag)) {
    const found = findTextPosts(value);
    if (found) return found;
  }
  return null;
}

function postsFromBody(body: unknown): unknown[] {
  const found = findTextPosts(body);
  if (found) return found;
  const routed = dig(body, ["output", "posts"]);
  return Array.isArray(routed) ? routed : [];
}

function traceOf(response: Response, body: unknown): TregCallTrace {
  const bag = record(body);
  const headerCost = Number(header(response.headers, "x-treg-cost-micro") ?? "");
  const bodyCost = typeof bag?.costUsd === "number" ? Math.round(bag.costUsd * 1_000_000) : null;
  const provider = typeof bag?.provider === "string" ? bag.provider : null;
  return {
    callId: header(response.headers, "x-treg-call-id"),
    servedBy: header(response.headers, "x-treg-served-by") ?? provider,
    costMicro: Number.isFinite(headerCost) ? headerCost : bodyCost,
  };
}

async function callSearch(input: {
  url: string;
  body: Record<string, string>;
  token: string;
  fetch: typeof fetch;
}): Promise<{ posts: XPost[]; treg: TregCallTrace }> {
  let response: Response;
  try {
    response = await input.fetch(input.url, {
      method: "POST",
      headers: {
        "X-Treg-Token": input.token,
        "content-type": "application/json",
        "X-Treg-Route-Max-Cost": TREG_MAX_COST_USD,
      },
      body: JSON.stringify(input.body),
    });
  } catch {
    throw new TregError("Recherche X injoignable.", 0, null);
  }
  const raw = await response.json().catch(() => null);
  if (!response.ok) throw failure(response.status, errorCode(raw));
  if (raw === null) throw new TregError("Réponse Treg illisible.", response.status, null);
  return { posts: postsFromBody(raw).map(normalizeXPost), treg: traceOf(response, raw) };
}

function canFallback(error: unknown): boolean {
  if (!(error instanceof TregError)) return true;
  return error.status === 0 || error.status >= 500;
}

export async function searchXPosts(input: {
  query: string;
  token: string;
  fetch?: typeof fetch;
}): Promise<{ posts: XPost[]; treg: TregCallTrace }> {
  const fetchImpl = input.fetch ?? fetch;
  try {
    return await callSearch({
      url: ANYAPI_SEARCH_URL,
      body: { query: input.query, queryType: "Latest" },
      token: input.token,
      fetch: fetchImpl,
    });
  } catch (error) {
    if (!canFallback(error)) throw error;
    return callSearch({
      url: ROUTED_SEARCH_URL,
      body: { q: input.query },
      token: input.token,
      fetch: fetchImpl,
    });
  }
}

export interface PollDependencies {
  query: string;
  token: string;
  now: Date;
  activatedAt: Date;
  lookbackHours: number;
  spentMicro: number;
  capUsd: number;
  maxAgeDays?: number;
  existingIds: ReadonlySet<string>;
  fetch?: typeof fetch;
  ingest: (feedback: Feedback) => Promise<{ trace: IngestTrace; quarantined: boolean; processedAt: string }>;
}

export async function runXPoll(input: PollDependencies): Promise<PollXResult> {
  const limit = capMicro(input.capUsd);
  if (input.spentMicro >= limit) {
    throw new TregError("Plafond de la session atteint.", 402, "session_cap");
  }
  const searched = await searchXPosts({ query: input.query, token: input.token, fetch: input.fetch });
  const since = resolveSince({
    now: input.now,
    activatedAt: input.activatedAt,
    lookbackHours: input.lookbackHours,
    maxAgeDays: input.maxAgeDays,
  });
  const { fresh, ignored } = selectFreshPosts({
    posts: searched.posts,
    existingIds: input.existingIds,
    since,
    now: input.now,
    maxAgeDays: input.maxAgeDays,
  });
  const created: PollPostResult[] = [];
  const errors: string[] = [];
  const seen = new Set(input.existingIds);
  for (const item of fresh) {
    if (seen.has(item.feedback.id)) {
      ignored.push({ postId: item.post.id, reason: "deja_ingere" });
      continue;
    }
    seen.add(item.feedback.id);
    try {
      const ingested = await input.ingest(item.feedback);
      const detectedAt = item.feedback.listening?.detectedAt ?? input.now.toISOString();
      created.push({
        feedbackId: item.feedback.id,
        handle: item.feedback.author.handle,
        url: item.feedback.sourceUrl ?? null,
        publishedAt: item.post.publishedAt,
        detectedAt,
        processedAt: ingested.processedAt,
        indexDelayMs: delayMs(item.post.publishedAt, detectedAt),
        processDelayMs: delayMs(detectedAt, ingested.processedAt),
        quarantined: ingested.quarantined,
        trace: ingested.trace,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Analyse impossible.");
    }
  }
  return { found: searched.posts.length, created, ignored, errors, treg: searched.treg };
}
