import { LinearClient, type Issue } from "@linear/sdk";
import type { LinearApi, LinearIssueRef } from "./linear-sink";

async function toRef(issue: Issue): Promise<LinearIssueRef> {
  return {
    id: issue.id,
    identifier: issue.identifier,
    url: issue.url,
    description: issue.description ?? "",
    labelIds: issue.labelIds ?? [],
  };
}

/** LinearApi sur le SDK officiel. Seul fichier qui parle réellement à Linear. */
export class SdkLinearApi implements LinearApi {
  constructor(private readonly client: LinearClient) {}

  static fromKey(apiKey: string): SdkLinearApi {
    return new SdkLinearApi(new LinearClient({ apiKey }));
  }

  async findIssueByMarker(teamId: string, marker: string) {
    const page = await this.client.issues({
      first: 1,
      filter: { team: { id: { eq: teamId } }, description: { contains: marker } },
    });
    const issue = page.nodes[0];
    return issue ? toRef(issue) : null;
  }

  async getIssue(idOrIdentifier: string) {
    try {
      return await toRef(await this.client.issue(idOrIdentifier));
    } catch {
      return null;
    }
  }

  async createIssue(input: { teamId: string; title: string; description: string; estimate?: number; labelIds: string[] }) {
    const payload = await this.client.createIssue(input);
    const issue = await payload.issue;
    if (!payload.success || !issue) throw new Error("Linear n'a pas créé l'issue.");
    return toRef(issue);
  }

  async updateIssue(id: string, input: { description: string; labelIds: string[] }) {
    const payload = await this.client.updateIssue(id, input);
    const issue = await payload.issue;
    if (!payload.success || !issue) throw new Error(`Linear n'a pas mis à jour l'issue ${id}.`);
    return toRef(issue);
  }

  async ensureLabel(teamId: string, name: string, color: string) {
    const found = await this.client.issueLabels({
      first: 1,
      filter: { name: { eq: name }, or: [{ team: { id: { eq: teamId } } }, { team: { null: true } }] },
    });
    if (found.nodes[0]) return found.nodes[0].id;
    const payload = await this.client.createIssueLabel({ name, color, teamId });
    const label = await payload.issueLabel;
    if (!label) throw new Error(`Linear n'a pas créé le label « ${name} ».`);
    return label.id;
  }

  async ensureCustomer(externalId: string, name: string) {
    const found = await this.client.customers({ first: 1, filter: { externalIds: { some: { eq: externalId } } } });
    if (found.nodes[0]) return found.nodes[0].id;
    const payload = await this.client.createCustomer({ name, externalIds: [externalId] });
    if (!payload.success || !payload.customerId) throw new Error(`Linear n'a pas créé le client « ${name} ».`);
    return payload.customerId;
  }

  async hasCustomerNeed(issueId: string, customerId: string) {
    const found = await this.client.customerNeeds({
      first: 1,
      filter: { issue: { id: { eq: issueId } }, customer: { id: { eq: customerId } } },
    });
    return found.nodes.length > 0;
  }

  async createCustomerNeed(input: { issueId: string; customerId: string; body: string; attachmentUrl?: string }) {
    const payload = await this.client.createCustomerNeed(input);
    if (!payload.success) throw new Error("Linear n'a pas créé la demande client.");
  }
}
