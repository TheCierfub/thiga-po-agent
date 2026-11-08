import type { LinearApi, LinearIssueRef, LinearTeam } from "./linear-sink";

/** Lectures seules sur Linear : de quoi savoir ce qui serait créé ou mis à jour. */
export interface LinearReader {
  resolveTeam(idOrKey: string): Promise<LinearTeam | null>;
  findIssueByMarker(teamId: string, marker: string): Promise<LinearIssueRef | null>;
  getIssue(idOrIdentifier: string): Promise<LinearIssueRef | null>;
  findLabel(teamId: string, name: string): Promise<string | null>;
  findCustomer(externalId: string): Promise<string | null>;
  hasCustomerNeed(issueId: string, customerId: string): Promise<boolean>;
}

const DRY = "a-blanc:";

/**
 * Export à blanc : les lectures passent par Linear (ou par rien, hors ligne), les écritures sont
 * seulement décrites dans `operations`. Aucune requête d'écriture n'est émise.
 */
export class DryRunLinearApi implements LinearApi {
  readonly operations: string[] = [];
  private created = 0;
  private readonly identifiers = new Map<string, string>();
  private readonly customers = new Map<string, string>();

  /** `reader` null : aucune lecture possible (clé absente), tout est supposé à créer. */
  constructor(private readonly reader: LinearReader | null) {}

  async resolveTeam(idOrKey: string): Promise<LinearTeam | null> {
    return this.reader ? this.reader.resolveTeam(idOrKey) : { id: idOrKey, key: idOrKey, name: "(hors ligne)" };
  }

  private remember(issue: LinearIssueRef | null) {
    if (issue) this.identifiers.set(issue.id, issue.identifier);
    return issue;
  }

  async findIssueByMarker(teamId: string, marker: string) {
    return this.remember(this.reader ? await this.reader.findIssueByMarker(teamId, marker) : null);
  }

  async getIssue(idOrIdentifier: string) {
    return this.remember(this.reader ? await this.reader.getIssue(idOrIdentifier) : null);
  }

  async createIssue(input: { teamId: string; title: string; description: string; estimate?: number; labelIds: string[] }) {
    const id = `${DRY}issue-${++this.created}`;
    this.identifiers.set(id, `nouvelle issue « ${input.title} »`);
    this.operations.push(
      `Créerait l'issue « ${input.title} » (estimation ${input.estimate ?? "aucune"}, ${input.labelIds.length} label(s), description de ${input.description.length} caractères).`,
    );
    return { id, identifier: "(à créer)", url: "", description: input.description, labelIds: input.labelIds };
  }

  async updateIssue(id: string, input: { description: string; labelIds: string[] }) {
    const issue = this.reader ? await this.reader.getIssue(id) : null;
    const name = issue?.identifier ?? id;
    const changes = [
      issue && issue.description !== input.description ? "section Étai de la description" : null,
      issue && issue.labelIds.join() !== input.labelIds.join() ? "label MoSCoW" : null,
    ].filter(Boolean);
    this.operations.push(`Mettrait à jour ${name} (${changes.join(", ") || "description et labels"}). Estimation et texte manuel conservés.`);
    return { id, identifier: name, url: issue?.url ?? "", description: input.description, labelIds: input.labelIds };
  }

  async ensureLabel(teamId: string, name: string) {
    const found = this.reader && !teamId.startsWith(DRY) ? await this.reader.findLabel(teamId, name) : null;
    if (found) return found;
    const id = `${DRY}label:${name}`;
    if (!this.operations.some((o) => o.includes(`le label « ${name} »`))) this.operations.push(`Créerait le label « ${name} ».`);
    return id;
  }

  async ensureCustomer(externalId: string, name: string) {
    const found = this.reader ? await this.reader.findCustomer(externalId) : null;
    const id = found ?? `${DRY}client:${externalId}`;
    this.customers.set(id, name);
    if (found) return found;
    if (!this.operations.some((o) => o.includes(`(${externalId})`))) this.operations.push(`Créerait le client « ${name} » (${externalId}).`);
    return id;
  }

  async hasCustomerNeed(issueId: string, customerId: string) {
    if (!this.reader || issueId.startsWith(DRY) || customerId.startsWith(DRY)) return false;
    return this.reader.hasCustomerNeed(issueId, customerId);
  }

  async createCustomerNeed(input: { issueId: string; customerId: string; body: string; attachmentUrl?: string }) {
    const target = this.identifiers.get(input.issueId) ?? input.issueId;
    const customer = this.customers.get(input.customerId) ?? input.customerId;
    this.operations.push(`Ajouterait une demande client de ${customer} sur ${target}.`);
  }
}
