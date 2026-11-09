import type {
  Account,
  AuthorMatch,
  Channel,
  Feedback,
  Impact,
  ReachMode,
  RiceScore,
  Size,
  Strategy,
} from "../schemas";
import { inWindow, type Window } from "./window";

export interface ReachInput {
  feedbackIds: string[];
  feedbacks: ReadonlyMap<string, Feedback>;
  matches: ReadonlyMap<string, AuthorMatch>;
  accounts: ReadonlyMap<string, Account>;
  window: Window;
  mode: ReachMode;
  /** Feedbacks ajoutés en direct : ils comptent même s'ils sont datés après la fin de fenêtre du lot. */
  includeIds?: ReadonlySet<string>;
}

/**
 * Reach visible et réversible : comptes distincts (défaut), messages, ou ARR en milliers d'euros.
 * Seuls les auteurs rapprochés avec certitude apportent un compte.
 */
export function computeReach(input: ReachInput): RiceScore["reach"] & { channels: Channel[] } {
  const accounts = new Set<string>();
  const channels = new Set<Channel>();
  const excluded: { feedbackId: string; reason: string }[] = [];
  let messages = 0;

  for (const id of input.feedbackIds) {
    const feedback = input.feedbacks.get(id);
    if (!feedback) throw new Error(`Feedback inconnu dans un thème : ${id}`);
    if (!inWindow(feedback.receivedAt, input.window) && !input.includeIds?.has(id)) {
      excluded.push({ feedbackId: id, reason: "hors fenêtre de 4 semaines" });
      continue;
    }
    messages += 1;
    channels.add(feedback.channel);
    const match = input.matches.get(id);
    if (match?.confidence === "certaine" && match.accountId) {
      accounts.add(match.accountId);
    } else {
      excluded.push({
        feedbackId: id,
        reason: `auteur ${match?.confidence ?? "inconnu"} : message compté, compte non compté`,
      });
    }
  }

  const accountList = [...accounts].sort();
  const arr = accountList.reduce((sum, id) => sum + (input.accounts.get(id)?.arr ?? 0), 0);
  const value =
    input.mode === "comptes" ? accountList.length : input.mode === "volume" ? messages : arr / 1000;

  return {
    mode: input.mode,
    value,
    accounts: accountList,
    messages,
    arr,
    window: input.window,
    excluded,
    channels: [...channels].sort(),
  };
}

export const CONFIDENCE_RULE = {
  full: { minAccounts: 3, minChannels: 2 },
  medium: { minAccounts: 2 },
} as const;

/**
 * Un thème déjà évalué n'est renvoyé au modèle que si son palier de confiance change.
 * Ce palier franchit 2 comptes (80 %) ou 3 comptes et 2 canaux (100 %).
 */
export function shouldReassessTheme(isNew: boolean, previousConfidence: number | null, nextConfidence: number): boolean {
  if (isNew || previousConfidence === null) return true;
  return previousConfidence !== nextConfidence;
}

export function computeConfidence(accountCount: number, channels: readonly string[]): RiceScore["confidence"] {
  const distinctChannels = new Set(channels).size;
  const { full, medium } = CONFIDENCE_RULE;
  if (accountCount >= full.minAccounts && distinctChannels >= full.minChannels) {
    return {
      value: 1,
      channels: [...channels],
      rule: `100 % : ${accountCount} comptes distincts (≥ ${full.minAccounts}) sur ${distinctChannels} canaux (≥ ${full.minChannels})`,
    };
  }
  if (accountCount >= medium.minAccounts) {
    return {
      value: 0.8,
      channels: [...channels],
      rule: `80 % : ${accountCount} comptes distincts (≥ ${medium.minAccounts}), ${distinctChannels} canal(aux)`,
    };
  }
  return {
    value: 0.5,
    channels: [...channels],
    rule: `50 % : ${accountCount} compte(s) distinct(s), preuve étroite`,
  };
}

export interface RiceInput {
  themeKey: string;
  reach: RiceScore["reach"];
  confidence: RiceScore["confidence"];
  impact: { value: Impact; source: "llm" | "po" };
  effort: { size: Size; source: "llm" | "po" };
  strategy: Strategy;
}

/** RICE = Reach × Impact × Confidence ÷ Effort (points). Calculé ici, jamais par le LLM. */
export function computeRice(input: RiceInput): RiceScore {
  const points = input.strategy.sizePoints[input.effort.size];
  const raw = (input.reach.value * input.impact.value * input.confidence.value) / points;
  return {
    themeKey: input.themeKey,
    reach: input.reach,
    impact: input.impact,
    confidence: input.confidence,
    effort: { size: input.effort.size, points, source: input.effort.source },
    score: Math.round(raw * 1000) / 1000,
  };
}
