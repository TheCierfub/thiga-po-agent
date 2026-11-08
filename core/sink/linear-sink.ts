import type { MoscowClass } from "../schemas";
import type { BacklogItem, BacklogSink, SinkResult } from "./backlog-sink";

/** Ce dont LinearSink a besoin de Linear. L'implémentation réelle est dans `linear-api.ts`. */
export interface LinearIssueRef {
  id: string;
  identifier: string;
  url: string;
  description: string;
  labelIds: string[];
}

export interface LinearApi {
  /** Issue de l'équipe dont la description contient ce marqueur. */
  findIssueByMarker(teamId: string, marker: string): Promise<LinearIssueRef | null>;
  /** Issue par identifiant (`LIN-41`) ou UUID ; null si elle n'existe pas. */
  getIssue(idOrIdentifier: string): Promise<LinearIssueRef | null>;
  createIssue(input: { teamId: string; title: string; description: string; estimate?: number; labelIds: string[] }): Promise<LinearIssueRef>;
  updateIssue(id: string, input: { description: string; labelIds: string[] }): Promise<LinearIssueRef>;
  ensureLabel(teamId: string, name: string, color: string): Promise<string>;
  ensureCustomer(externalId: string, name: string): Promise<string>;
  hasCustomerNeed(issueId: string, customerId: string): Promise<boolean>;
  createCustomerNeed(input: { issueId: string; customerId: string; body: string; attachmentUrl?: string }): Promise<void>;
}

export interface LinearSinkOptions {
  teamId: string;
  /** Créer une demande client (Customer Request) par compte qui porte le thème. */
  customerRequests?: boolean;
  feedbackUrl?: (feedbackId: string) => string;
}

export const MOSCOW_LABEL_COLORS: Record<"Must" | "Should" | "Could" | "Won't", string> = {
  Must: "#d4380d",
  Should: "#d48806",
  Could: "#389e0d",
  "Won't": "#8c8c8c",
};

export const moscowLabelName = (moscow: MoscowClass) => `MoSCoW : ${moscow}`;

const startMarker = (key: string) => `<!-- ${key} début -->`;
const endMarker = (key: string) => `<!-- ${key} fin -->`;

/**
 * Remplace la section Étai d'une description (ou l'ajoute à la fin). Le texte écrit à la main dans
 * l'issue, avant ou après la section, est conservé.
 */
export function mergeSection(description: string, stableKey: string, body: string): string {
  const section = `${startMarker(stableKey)}\n${body.trim()}\n\n_Clé stable : \`${stableKey}\`. Section générée par l'agent Étai après validation du PO._\n${endMarker(stableKey)}`;
  const start = description.indexOf(startMarker(stableKey));
  const end = description.indexOf(endMarker(stableKey));
  if (start >= 0 && end > start) {
    return `${description.slice(0, start)}${section}${description.slice(end + endMarker(stableKey).length)}`;
  }
  return description.trim() ? `${description.trimEnd()}\n\n${section}` : section;
}

function isEstimateError(error: unknown): boolean {
  return error instanceof Error && /estimat/i.test(error.message);
}

/**
 * Export vers Linear, après validation du PO dans l'interface. Le LLM n'a jamais accès à cet outil.
 * - Thème rattaché à une issue existante (LIN-xx) : on la met à jour, on n'en crée pas d'autre.
 * - Sinon, on cherche l'issue par sa clé stable avant de créer : relancer l'export ne crée pas de doublon.
 * - Une issue créée porte l'estimation dérivée de la taille et un label MoSCoW. Une issue existante garde
 *   son estimation : elle appartient à l'équipe.
 * - Un élément bloqué (« à revoir ») n'est jamais poussé.
 */
export class LinearSink implements BacklogSink {
  readonly name = "linear";
  private readonly labelIds = new Map<string, string>();

  constructor(
    private readonly api: LinearApi,
    private readonly options: LinearSinkOptions,
  ) {}

  private async label(moscow: keyof typeof MOSCOW_LABEL_COLORS): Promise<string> {
    let id = this.labelIds.get(moscow);
    if (!id) {
      id = await this.api.ensureLabel(this.options.teamId, moscowLabelName(moscow), MOSCOW_LABEL_COLORS[moscow]);
      this.labelIds.set(moscow, id);
    }
    return id;
  }

  private async moscowLabels(moscow: MoscowClass): Promise<{ keep: string; drop: string[] } | null> {
    if (!(moscow in MOSCOW_LABEL_COLORS)) return null;
    const all = await Promise.all((Object.keys(MOSCOW_LABEL_COLORS) as (keyof typeof MOSCOW_LABEL_COLORS)[]).map(async (m) => [m, await this.label(m)] as const));
    return { keep: all.find(([m]) => m === moscow)![1], drop: all.filter(([m]) => m !== moscow).map(([, id]) => id) };
  }

  async push(items: BacklogItem[]): Promise<SinkResult[]> {
    const results: SinkResult[] = [];
    for (const item of items) {
      if (item.blocked) {
        results.push({ stableKey: item.stableKey, action: "bloque", target: item.existingIssueId, reason: item.blocked });
        continue;
      }
      results.push(await this.pushOne(item));
    }
    return results;
  }

  private async pushOne(item: BacklogItem): Promise<SinkResult> {
    const notes: string[] = [];
    const labels = await this.moscowLabels(item.moscow);

    let issue: LinearIssueRef | null = null;
    if (item.existingIssueId) {
      issue = await this.api.getIssue(item.existingIssueId);
      if (!issue) notes.push(`${item.existingIssueId} introuvable dans cet espace Linear : recherche par clé stable.`);
    }
    issue ??= await this.api.findIssueByMarker(this.options.teamId, item.stableKey);

    let action: SinkResult["action"];
    if (issue) {
      const description = mergeSection(issue.description, item.stableKey, item.body);
      const labelIds = labels
        ? [...new Set([...issue.labelIds.filter((id) => !labels.drop.includes(id)), labels.keep])]
        : issue.labelIds;
      const sameLabels = labelIds.length === issue.labelIds.length && labelIds.every((id) => issue!.labelIds.includes(id));
      if (description === issue.description && sameLabels) {
        action = "inchange";
      } else {
        issue = await this.api.updateIssue(issue.id, { description, labelIds });
        action = "mis_a_jour";
      }
    } else {
      const input = {
        teamId: this.options.teamId,
        title: item.title,
        description: mergeSection("", item.stableKey, item.body),
        estimate: item.details.points,
        labelIds: labels ? [labels.keep] : [],
      };
      try {
        issue = await this.api.createIssue(input);
      } catch (error) {
        if (!isEstimateError(error)) throw error;
        issue = await this.api.createIssue({ ...input, estimate: undefined });
        notes.push(`Estimation ${item.details.points} refusée par l'échelle de l'équipe : issue créée sans estimation.`);
      }
      action = "cree";
    }

    if (this.options.customerRequests !== false) {
      notes.push(...(await this.customerRequests(issue, item)));
    }
    return { stableKey: item.stableKey, action, target: issue.identifier, url: issue.url, ...(notes.length ? { notes } : {}) };
  }

  /** Une demande client par compte, rattachée à l'issue. Un échec ici n'annule pas l'export de l'issue. */
  private async customerRequests(issue: LinearIssueRef, item: BacklogItem): Promise<string[]> {
    const notes: string[] = [];
    let created = 0;
    try {
      for (const customer of item.details.customers) {
        const customerId = await this.api.ensureCustomer(`etai:${customer.accountId}`, customer.name);
        if (await this.api.hasCustomerNeed(issue.id, customerId)) continue;
        const body = [
          `Remonté par ${customer.name} (${customer.feedbackIds.join(", ") || "sans feedback dans la fenêtre"}).`,
          ...customer.quotes.map((q) => `> ${q}`),
        ].join("\n\n");
        const first = customer.feedbackIds[0];
        await this.api.createCustomerNeed({
          issueId: issue.id,
          customerId,
          body,
          ...(first && this.options.feedbackUrl ? { attachmentUrl: this.options.feedbackUrl(first) } : {}),
        });
        created++;
      }
      if (created > 0) notes.push(`${created} demande(s) client ajoutée(s).`);
    } catch (error) {
      notes.push(`Demandes clients non créées : ${error instanceof Error ? error.message : String(error)}.`);
    }
    return notes;
  }
}
