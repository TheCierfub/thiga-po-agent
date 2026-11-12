"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadContext, loadPoDecisions } from "@/core/data/load";
import { createLiveProvider } from "@/core/llm/live-profile";
import {
  DirectFeedbackInputSchema,
  DirectIngestError,
  LIVE_BATCH,
  buildDirectFeedback,
  ingestDirectFeedback,
} from "@/core/pipeline/direct";
import type { IngestTrace } from "@/core/pipeline/ingest-trace";
import { DEMO_DECISIONS_FILE } from "@/core/pipeline/replay-demo";
import { OUTBOX_DIR, buildRecontactDrafts, writeToOutbox } from "@/core/outbox/recontact";
import { FORCEABLE_CLASSES, PoOverridesSchema, reprioritize } from "@/core/scoring/overrides";
import { SizeSchema, UserStoryDraftSchema, type UserStoryDraft } from "@/core/schemas";
import { draftStory } from "@/core/steps/draft-story";
import { placeStory } from "@/core/stories/place";
import { ReplayProvider } from "@/core/llm/fixtures";
import { recordThemeExport } from "@/core/export/engage";
import type { LinearComments } from "@/core/export/comment";
import { buildBacklogItems, type SinkResult } from "@/core/sink/backlog-sink";
import { LINEAR_EXPORT_DIR, exportTarget } from "@/core/sink/export-target";
import { SdkLinearApi } from "@/core/sink/linear-api";
import { DEMO_BATCHES } from "@/lib/etai/batches";
import { resolveDataMode } from "@/lib/etai/data-mode";
import {
  ACCESS_CLOSED,
  ACCESS_COOKIE,
  ACCESS_DENIED,
  ACCESS_LIMIT,
  ACCESS_MAX_AGE_S,
  checkAccessCode,
  signAccessCookie,
} from "@/core/auth/access-code";
import { safeNextPath } from "@/core/auth/gate";
import { getPublicOrigin } from "@/core/auth/origin";
import { beginLinearConnect, disconnectLinear, finishLinearConnect, inspectLinearAccount } from "@/core/linear/connect";
import { requireAccess } from "@/lib/etai/access";
import { takeAccessAttempt } from "@/lib/etai/access-limit";
import { consumeQuota } from "@/lib/etai/quota";
import { activeLinearKey, readKeySource } from "@/lib/etai/export-mode";
import { linearCookieJar, readLinearCookieSecret } from "@/lib/etai/linear-cookie";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROOT, feedbackUrl } from "@/lib/etai/runs";
import { getBatchView } from "@/lib/etai/view";
import { DEFAULT_X_QUERY, capMicro, readMaxAgeDays, readSessionCapUsd } from "@/core/sources/x-listen";
import { TregError, runXPoll, type PollPostResult, type TregCallTrace } from "@/core/sources/x";

/** Commentaires sur l'équipe de la connexion active (session, sinon défaut). */
async function linearForIngest(): Promise<{ comments: LinearComments; scope: { workspaceId: string; teamId: string } } | null> {
  const gate = await requireAccess();
  if (!gate.ok) return null;
  const active = await activeLinearKey();
  if (!active) return null;
  const api = SdkLinearApi.fromKey(active.apiKey);
  return {
    comments: {
      listComments: (issueId) => api.listComments(issueId),
      createComment: (input) => api.createComment(input),
    },
    scope: { workspaceId: active.workspaceId, teamId: active.teamId },
  };
}

function scrub(error: unknown): string {
  const token = process.env.TREG_TOKEN?.trim();
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/sk-or-[\w-]+/g, "[clé]")
    .replace(/sb_(?:publishable|secret)_[\w-]+/g, "[clé]")
    .replace(/lin_api_[\w-]+/g, "[clé]");
  const hidden = token ? message.split(token).join("[clé]") : message;
  return hidden.slice(0, 400);
}

const OverridesSchema = z.object({
  effort: z.record(z.string(), SizeSchema),
  forced: z.record(z.string(), z.object({ moscow: z.enum(FORCEABLE_CLASSES), motif: z.string().max(500) })),
});

const ExportInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  themeKey: z.string().regex(/^[a-z0-9_]+$/),
  overrides: OverridesSchema,
  story: UserStoryDraftSchema.optional(),
});

export type ExportOutcome =
  | { ok: true; mode: "linear" | "markdown"; label: string; reason: string | null; result: SinkResult; location: string | null }
  | { ok: false; message: string };

export async function exportTheme(input: z.input<typeof ExportInput>): Promise<ExportOutcome> {
  const parsed = ExportInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Demande d'export invalide." };
  const { batch, themeKey, overrides, story } = parsed.data;
  const view = await getBatchView(batch);
  if (story && story.themeKey !== themeKey) return { ok: false, message: "La story ne correspond pas à ce thème." };
  if (story) await persistStory(batch, story);
  const accounts = new Map(loadContext(ROOT).accounts.map((account) => [account.id, account]));
  const { rice, allocation } = reprioritize(view.state, view.strategy, overrides);
  const stories = story ? placeStory(view.state.stories, story) : view.state.stories;
  const url = feedbackUrl(batch);
  const [item] = buildBacklogItems(
    { state: { ...view.state, stories, rice, allocation }, accounts, strategy: view.strategy },
    { feedbackUrl: url, themeKeys: [themeKey] },
  );
  if (!item) return { ok: false, message: "Ce thème n'est ni Must, ni Should, ni Could : il ne part pas vers le backlog." };

  const gate = await requireAccess();
  if (!gate.ok) return { ok: false, message: gate.message };
  const source = await readKeySource();
  if (source === "default") {
    const quota = await consumeQuota("export");
    if (!quota.ok) return { ok: false, message: quota.message };
  }
  const active = await activeLinearKey();
  const target = exportTarget({
    root: ROOT,
    feedbackUrl: url,
    env: {
      LINEAR_API_KEY: active?.apiKey ?? process.env.LINEAR_API_KEY,
      LINEAR_TEAM_ID: active?.teamId ?? process.env.LINEAR_TEAM_ID,
      LINEAR_CUSTOMER_REQUESTS: process.env.LINEAR_CUSTOMER_REQUESTS,
    },
  });
  try {
    const [result] = await target.sink.push([item]);
    if (!result) return { ok: false, message: "L'export n'a renvoyé aucun résultat." };
    if (target.mode === "linear" && result.action !== "bloque" && result.target && result.url) {
      const mode = await resolveDataMode();
      if (mode.kind === "live") {
        const stored = await mode.store.getRun(batch);
        if (stored) {
          const recorded = recordThemeExport(
            stored.state,
            themeKey,
            {
              id: result.issueId ?? result.target,
              identifier: result.target,
              url: result.url,
              ...(active
                ? {
                    teamId: active.teamId,
                    ...(active.workspaceId ? { workspaceId: active.workspaceId, workspaceName: active.workspaceName } : {}),
                  }
                : {}),
            },
            view.strategy,
            new Date().toISOString(),
          );
          await mode.store.saveRun({ ...stored, state: recorded.state });
          revalidatePath(`/${batch}`, "layout");
        }
      }
    }
    const location =
      target.mode === "markdown" && result.target ? `${LINEAR_EXPORT_DIR}/${result.target}` : (result.url ?? result.target ?? null);
    return { ok: true, mode: target.mode, label: target.label, reason: target.reason, result, location };
  } catch (error) {
    return { ok: false, message: `${target.label} a refusé l'export : ${scrub(error)}` };
  }
}

export type LinearTeamsOutcome =
  | { ok: true; viewerName: string; workspaceName: string; teams: { id: string; key: string; name: string }[] }
  | { ok: false; message: string };

/** Vérifie la clé et prépare le choix d'équipe. La clé ne revient pas. */
export async function verifyLinearKey(apiKey: string): Promise<LinearTeamsOutcome> {
  const secret = readLinearCookieSecret();
  if (!secret) return { ok: false, message: "Le serveur ne peut pas garder la clé pour l'instant." };
  const inspected = await inspectLinearAccount(apiKey, async (key) => SdkLinearApi.fromKey(key).inspectAccount());
  if (!inspected.ok) return inspected;
  beginLinearConnect(inspected.account, apiKey, await linearCookieJar(), secret);
  return {
    ok: true,
    viewerName: inspected.account.viewerName,
    workspaceName: inspected.account.workspaceName,
    teams: inspected.account.teams,
  };
}

/** Enregistre l'équipe choisie dans le cookie de session. */
export async function chooseLinearTeam(teamId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = readLinearCookieSecret();
  if (!secret) return { ok: false, message: "Le serveur ne peut pas garder la clé pour l'instant." };
  const chosen = finishLinearConnect(teamId, await linearCookieJar(), secret);
  if (!chosen.ok) return chosen;
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Oublie la clé du navigateur. La connexion du serveur, s'il y en a une, reprend. */
export async function disconnectLinearSession(): Promise<{ ok: true }> {
  disconnectLinear(await linearCookieJar());
  revalidatePath("/", "layout");
  return { ok: true };
}

const OutboxInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  feedbackId: z.string(),
  subject: z.string().max(300).nullable(),
  body: z.string().trim().min(1, "Le message est vide.").max(5000),
});

export type OutboxOutcome = { ok: true; file: string } | { ok: false; message: string };

/** Dépose le message dans la boîte de test. Aucun envoi : ni e-mail, ni message privé, ni réponse publique. */
export async function sendToOutbox(input: z.input<typeof OutboxInput>): Promise<OutboxOutcome> {
  const parsed = OutboxInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Message invalide." };
  const { batch, feedbackId, subject, body } = parsed.data;
  const view = await getBatchView(batch);
  const draft = buildRecontactDrafts(view.state).find((d) => d.feedbackId === feedbackId);
  if (!draft) return { ok: false, message: "Aucun brouillon de recontact pour ce feedback." };
  const file = writeToOutbox(path.join(ROOT, OUTBOX_DIR), {
    feedbackId,
    batch,
    channel: draft.channel,
    replyMode: draft.replyMode,
    recipient: draft.recipient,
    subject,
    body,
  });
  return { ok: true, file: path.relative(ROOT, file) };
}

const ArbitrageInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  overrides: PoOverridesSchema,
});

export type ArbitrageOutcome = { ok: true } | { ok: false; message: string };

/** Enregistre les arbitrages du PO. En mode démo, l'interface les garde dans le navigateur. */
export async function saveArbitrages(input: z.input<typeof ArbitrageInput>): Promise<ArbitrageOutcome> {
  const parsed = ArbitrageInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Arbitrage invalide." };
  const mode = await resolveDataMode();
  if (mode.kind !== "live") return { ok: false, message: "Mode démo : l'arbitrage reste dans ce navigateur." };
  const { batch, overrides } = parsed.data;
  const current = await mode.store.getArbitrages(batch);
  const decisions = current?.decisions ?? loadPoDecisions(ROOT, DEMO_DECISIONS_FILE);
  try {
    await mode.store.saveArbitrages(batch, { decisions, overrides });
  } catch (error) {
    return { ok: false, message: `Enregistrement impossible : ${scrub(error)}` };
  }
  revalidatePath(`/${batch}`, "layout");
  return { ok: true };
}

export type AddFeedbackOutcome =
  | { ok: true; elapsedMs: number; feedbackId: string; trace: IngestTrace }
  | { ok: false; message: string };

/**
 * Colle un feedback, l'analyse avec OpenRouter (seulement ce feedback et les thèmes touchés),
 * l'enregistre et recalcule la priorisation du lot en cours.
 */
export async function addFeedback(input: z.input<typeof DirectFeedbackInputSchema>): Promise<AddFeedbackOutcome> {
  const parsed = DirectFeedbackInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Feedback invalide." };
  const gate = await requireAccess();
  if (!gate.ok) return { ok: false, message: gate.message };
  const mode = await resolveDataMode();
  if (mode.kind !== "live") {
    return { ok: false, message: "Mode démo : rien n'est enregistré et aucun modèle n'est appelé." };
  }
  const quota = await consumeQuota("feedback");
  if (!quota.ok) return { ok: false, message: quota.message };
  const context = loadContext(ROOT);
  if (parsed.data.sourceAccountId && !context.accounts.some((account) => account.id === parsed.data.sourceAccountId)) {
    return { ok: false, message: "Compte client inconnu." };
  }
  const feedback = buildDirectFeedback(parsed.data);
  const decisions = (await mode.store.getArbitrages(LIVE_BATCH))?.decisions ?? loadPoDecisions(ROOT, DEMO_DECISIONS_FILE);
  try {
    const live = createLiveProvider(ROOT);
    const linear = await linearForIngest();
    const { elapsedMs, trace } = await ingestDirectFeedback({
      store: mode.store,
      feedback,
      provider: live.provider,
      decisions,
      context,
      decider: live.decider,
      linear: linear?.comments ?? null,
      linearScope: linear?.scope ?? null,
      usage: () =>
        live.meter.records.map((call) => ({
          task: call.step,
          key: "",
          durationMs: call.latencyMs,
          promptTokens: call.promptTokens,
          completionTokens: call.completionTokens,
          reasoningTokens: call.reasoningTokens,
          costUsd: call.costUsd,
        })),
    });
    revalidatePath("/lundi", "layout");
    revalidatePath("/jeudi", "layout");
    return { ok: true, elapsedMs, feedbackId: feedback.id, trace };
  } catch (error) {
    const message = error instanceof DirectIngestError ? error.message : scrub(error);
    return { ok: false, message };
  }
}

const PollInput = z.object({
  activatedAt: z.iso.datetime({ offset: true }),
  lookbackHours: z.number().min(0).max(72),
  spentMicro: z.number().int().nonnegative(),
});

export type PollXOutcome =
  | {
      ok: true;
      query: string;
      found: number;
      created: PollPostResult[];
      ignored: number;
      errors: string[];
      treg: TregCallTrace;
      spentMicro: number;
      stop: null | "cout";
    }
  | { ok: false; message: string; stop: boolean };

/** Un passage d'écoute. Le navigateur le rappelle tant que la page est ouverte. */
export async function pollXMentions(input: z.input<typeof PollInput>): Promise<PollXOutcome> {
  const parsed = PollInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Demande d'écoute invalide.", stop: false };
  const gate = await requireAccess();
  if (!gate.ok) return { ok: false, message: gate.message, stop: true };
  const token = process.env.TREG_TOKEN?.trim();
  if (!token) return { ok: false, message: "TREG_TOKEN est absent : l'écoute X est désactivée.", stop: true };
  const mode = await resolveDataMode();
  if (mode.kind !== "live") return { ok: false, message: "Mode démo : rien n'est enregistré et aucun modèle n'est appelé.", stop: true };
  const capUsd = readSessionCapUsd(process.env.ETAI_X_MAX_SESSION_USD);
  if (parsed.data.spentMicro >= capMicro(capUsd)) {
    return { ok: false, message: "Plafond de la session atteint.", stop: true };
  }
  const query = process.env.ETAI_X_QUERY?.trim() || DEFAULT_X_QUERY;
  const rows = await mode.store.listFeedbacks(LIVE_BATCH);
  const run = await mode.store.getRun(LIVE_BATCH);
  const existingIds = new Set([...rows.map((row) => row.feedback.id), ...(run?.state.feedbacks.map((item) => item.id) ?? [])]);
  const context = loadContext(ROOT);
  const decisions = (await mode.store.getArbitrages(LIVE_BATCH))?.decisions ?? loadPoDecisions(ROOT, DEMO_DECISIONS_FILE);

  try {
    const result = await runXPoll({
      query,
      token,
      now: new Date(),
      activatedAt: new Date(parsed.data.activatedAt),
      lookbackHours: parsed.data.lookbackHours,
      spentMicro: parsed.data.spentMicro,
      capUsd,
      maxAgeDays: readMaxAgeDays(process.env.ETAI_X_MAX_AGE_DAYS),
      existingIds,
      ingest: async (feedback) => {
        const live = createLiveProvider(ROOT);
        const linear = await linearForIngest();
        const { result: ingested, trace } = await ingestDirectFeedback({
          store: mode.store,
          feedback,
          provider: live.provider,
          decisions,
          context,
          decider: live.decider,
          linear: linear?.comments ?? null,
          linearScope: linear?.scope ?? null,
          usage: () =>
            live.meter.records.map((call) => ({
              task: call.step,
              key: "",
              durationMs: call.latencyMs,
              promptTokens: call.promptTokens,
              completionTokens: call.completionTokens,
              reasoningTokens: call.reasoningTokens,
              costUsd: call.costUsd,
            })),
        });
        const processedAt = new Date().toISOString();
        const stamped = feedback.listening ? { ...feedback, listening: { ...feedback.listening, processedAt } } : feedback;
        const state = {
          ...ingested.state,
          feedbacks: ingested.state.feedbacks.map((item) =>
            item.id === feedback.id && item.listening ? { ...item, listening: { ...item.listening, processedAt } } : item,
          ),
        };
        await mode.store.upsertFeedbacks([{ feedback: stamped, origin: "direct" }]);
        await mode.store.saveRun({ state, newFeedbackIds: ingested.newFeedbackIds, changes: ingested.changes });
        const classification = state.classifications.find((item) => item.feedbackId === feedback.id);
        return { trace, quarantined: Boolean(classification?.injection.quarantined), processedAt };
      },
    });
    if (result.created.length > 0) {
      revalidatePath("/lundi", "layout");
      revalidatePath("/jeudi", "layout");
    }
    const spentMicro = parsed.data.spentMicro + (result.treg.costMicro ?? 0);
    return {
      ok: true,
      query,
      found: result.found,
      created: result.created,
      ignored: result.ignored.length,
      errors: result.errors.map((item) => scrub(new Error(item))),
      treg: result.treg,
      spentMicro,
      stop: spentMicro >= capMicro(capUsd) ? "cout" : null,
    };
  } catch (error) {
    const stop = error instanceof TregError && (error.status === 401 || error.status === 402);
    return { ok: false, message: scrub(error), stop };
  }
}

const ThemeInput = z.object({
  batch: z.enum(DEMO_BATCHES),
  themeKey: z.string().regex(/^[a-z0-9_]+$/),
  overrides: OverridesSchema,
});

export type StoryOutcome =
  | { ok: true; story: UserStoryDraft; elapsedMs: number; costUsd: number | null; persisted: boolean }
  | { ok: false; message: string };

async function persistStory(batch: (typeof DEMO_BATCHES)[number], story: UserStoryDraft): Promise<boolean> {
  const mode = await resolveDataMode();
  if (mode.kind !== "live") return false;
  const stored = await mode.store.getRun(batch);
  if (!stored) return false;
  await mode.store.saveRun({
    ...stored,
    state: { ...stored.state, stories: placeStory(stored.state.stories, story) },
  });
  revalidatePath(`/${batch}`, "layout");
  return true;
}

/** Rédige la story d'un thème, à la demande. En direct, Sonnet ; en démo, la réponse déjà écrite. */
export async function generateThemeStory(input: z.input<typeof ThemeInput>): Promise<StoryOutcome> {
  const parsed = ThemeInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Demande de story invalide." };
  const gate = await requireAccess();
  if (!gate.ok) return { ok: false, message: gate.message };
  const { batch, themeKey, overrides } = parsed.data;
  const view = await getBatchView(batch);
  const theme = view.state.themes.find((item) => item.key === themeKey);
  const assessment = view.state.assessments.find((item) => item.themeKey === themeKey);
  if (!theme || !assessment) return { ok: false, message: "Ce thème n'a pas d'évaluation à raconter." };
  const quarantined = new Set(view.state.classifications.filter((item) => item.injection.quarantined).map((item) => item.feedbackId));
  const usable = {
    ...theme,
    feedbackIds: theme.feedbackIds.filter((id) => !quarantined.has(id)),
    quotes: theme.quotes.filter((quote) => !quarantined.has(quote.feedbackId)),
  };
  if (usable.feedbackIds.length === 0) return { ok: false, message: "Les feedbacks de ce thème sont en quarantaine : rien à rédiger." };
  const { rice, allocation } = reprioritize(view.state, view.strategy, overrides);
  const riceScore = rice.find((item) => item.themeKey === themeKey);
  const decision = allocation.decisions.find((item) => item.themeKey === themeKey);
  if (!riceScore || !decision) return { ok: false, message: "Ce thème n'a pas de score." };
  const mode = await resolveDataMode();
  if (mode.kind === "live") {
    const quota = await consumeQuota("story");
    if (!quota.ok) return { ok: false, message: quota.message };
  }
  const live = mode.kind === "live" ? createLiveProvider(ROOT) : null;
  const provider = live?.provider ?? new ReplayProvider(path.join(ROOT, "fixtures/llm"), { allowStale: true });
  const started = Date.now();
  try {
    const story = await draftStory(
      {
        batch,
        theme: usable,
        assessment,
        rice: riceScore,
        decision,
        feedbacks: new Map(view.state.feedbacks.map((feedback) => [feedback.id, feedback])),
        strategy: view.strategy,
        backlogIssue: theme.backlogIssueId ? (view.backlog.find((issue) => issue.id === theme.backlogIssueId) ?? null) : null,
        evidenceHash: view.state.evidence[themeKey] ?? theme.key,
      },
      provider,
    );
    const persisted = await persistStory(batch, story);
    const costUsd = live ? live.meter.records.reduce((sum, call) => sum + (call.costUsd ?? 0), 0) : null;
    return { ok: true, story, elapsedMs: Date.now() - started, costUsd, persisted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Aucune réponse enregistrée")) return { ok: false, message: "Pas de story déjà écrite pour ce thème en mode démo. Branchez OpenRouter pour la rédiger." };
    return { ok: false, message: scrub(error) };
  }
}

export async function saveThemeStory(input: { batch: (typeof DEMO_BATCHES)[number]; story: UserStoryDraft }): Promise<{ ok: true; persisted: boolean } | { ok: false; message: string }> {
  const story = UserStoryDraftSchema.safeParse(input.story);
  if (!story.success || !DEMO_BATCHES.includes(input.batch)) return { ok: false, message: "Story illisible." };
  try {
    const persisted = await persistStory(input.batch, story.data);
    return { ok: true, persisted };
  } catch (error) {
    return { ok: false, message: scrub(error) };
  }
}

async function publicOrigin(): Promise<string | null> {
  const headerStore = await headers();
  return getPublicOrigin({
    configuredUrl: process.env.ETAI_PUBLIC_URL,
    forwardedHost: headerStore.get("x-forwarded-host"),
    forwardedProto: headerStore.get("x-forwarded-proto"),
    requestOrigin: headerStore.get("origin"),
    nodeEnv: process.env.NODE_ENV,
  });
}

export async function unlockAccess(code: string, nextPath: string): Promise<{ ok: false; message: string } | undefined> {
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip")?.trim() || "inconnue";
  const limited = takeAccessAttempt(ip);
  if (!limited.ok) return { ok: false, message: limited.message || ACCESS_LIMIT };
  const secret = process.env.ACCESS_COOKIE_SECRET;
  const verdict = checkAccessCode(code, process.env.DEMO_ACCESS_CODE);
  if (verdict === "closed" || !secret?.trim()) return { ok: false, message: ACCESS_CLOSED };
  if (verdict !== "ok") return { ok: false, message: ACCESS_DENIED };
  const exp = Math.floor(Date.now() / 1000) + ACCESS_MAX_AGE_S;
  const secure = headerStore.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
  (await cookies()).set(ACCESS_COOKIE, signAccessCookie(secret, exp), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE_S,
  });
  const origin = await publicOrigin();
  const next = safeNextPath(nextPath);
  redirect(origin ? `${origin}${next}` : next);
}

export async function leaveAccess(): Promise<void> {
  (await cookies()).delete(ACCESS_COOKIE);
  const origin = await publicOrigin();
  redirect(origin ? `${origin}/acces` : "/acces");
}

