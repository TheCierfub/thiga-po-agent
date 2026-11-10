import { LinearClient, type Issue } from "@linear/sdk";
import { collectTeamPages } from "../linear/teams";
import type { LinearApi, LinearIssueRef } from "./linear-sink";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  async resolveTeam(idOrKey: string) {
    const filter = UUID.test(idOrKey) ? { id: { eq: idOrKey } } : { key: { eqIgnoreCase: idOrKey } };
    const team = (await this.client.teams({ first: 1, filter })).nodes[0];
    return team ? { id: team.id, key: team.key, name: team.name } : null;
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

  async findLabel(teamId: string, name: string) {
    const found = await this.client.issueLabels({
      first: 1,
      filter: { name: { eq: name }, or: [{ team: { id: { eq: teamId } } }, { team: { null: true } }] },
    });
    return found.nodes[0]?.id ?? null;
  }

  async ensureLabel(teamId: string, name: string, color: string) {
    const found = await this.findLabel(teamId, name);
    if (found) return found;
    const payload = await this.client.createIssueLabel({ name, color, teamId });
    const label = await payload.issueLabel;
    if (!label) throw new Error(`Linear n'a pas créé le label « ${name} ».`);
    return label.id;
  }

  async findCustomer(externalId: string) {
    const found = await this.client.customers({ first: 1, filter: { externalIds: { some: { eq: externalId } } } });
    return found.nodes[0]?.id ?? null;
  }

  async ensureCustomer(externalId: string, name: string) {
    const found = await this.findCustomer(externalId);
    if (found) return found;
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

  async listComments(issueId: string): Promise<{ body: string }[]> {
    const issue = await this.client.issue(issueId);
    const page = await issue.comments({ first: 50 });
    return page.nodes.map((comment) => ({ body: comment.body }));
  }

  async createComment(input: { issueId: string; body: string }): Promise<void> {
    const issue = await this.client.issue(input.issueId);
    const payload = await this.client.createComment({ issueId: issue.id, body: input.body });
    if (!payload.success) throw new Error("Linear n'a pas créé le commentaire.");
  }

  /** Lecture du compte : qui, quel espace, quelles équipes. Aucune écriture. */
  async inspectAccount(): Promise<{ viewerName: string; workspaceId: string; workspaceName: string; teams: { id: string; key: string; name: string }[] }> {
    const viewer = await this.client.viewer;
    const organization = await viewer.organization;
    const teams = await collectTeamPages(async (after) => {
      const page = await this.client.teams({ first: 50, after });
      return {
        nodes: page.nodes.map((team) => ({ id: team.id, key: team.key, name: team.name })),
        hasNextPage: page.pageInfo.hasNextPage,
        endCursor: page.pageInfo.endCursor ?? null,
      };
    });
    return {
      viewerName: viewer.name,
      workspaceId: organization.id,
      workspaceName: organization.name,
      teams,
    };
  }
}
