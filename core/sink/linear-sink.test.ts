import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPoDecisions } from "../data/load";
import { ReplayProvider } from "../llm/fixtures";
import { runBatch } from "../pipeline/run";
import { ROOT } from "../test/helpers";
import { buildBacklogItems, type BacklogItem } from "./backlog-sink";
import { exportTarget } from "./export-target";
import { DryRunLinearApi } from "./linear-dry-run";
import { LinearSink, mergeSection, moscowLabelName, type LinearApi, type LinearIssueRef } from "./linear-sink";

/** Linear en mémoire : on vérifie les appels, aucun ne sort de la machine. */
class FakeLinear implements LinearApi {
  issues: (LinearIssueRef & { teamId: string; title: string; estimate?: number })[] = [];
  labels = new Map<string, string>();
  customers = new Map<string, { id: string; name: string }>();
  needs: { issueId: string; customerId: string; body: string; attachmentUrl?: string }[] = [];
  calls: string[] = [];
  failEstimate = false;
  failCustomers = false;

  seed(identifier: string, description: string, labelIds: string[] = []) {
    this.issues.push({ id: `uuid-${identifier}`, identifier, url: `https://linear.app/etai/issue/${identifier}`, description, labelIds, teamId: "team", title: identifier });
  }
  async findIssueByMarker(teamId: string, marker: string) {
    this.calls.push("find");
    return this.issues.find((i) => i.teamId === teamId && i.description.includes(marker)) ?? null;
  }
  async getIssue(id: string) {
    this.calls.push(`get:${id}`);
    return this.issues.find((i) => i.identifier === id || i.id === id) ?? null;
  }
  async createIssue(input: { teamId: string; title: string; description: string; estimate?: number; labelIds: string[] }) {
    this.calls.push("create");
    if (this.failEstimate && input.estimate !== undefined) throw new Error("Invalid estimate for team scale");
    const identifier = `ETA-${this.issues.length + 1}`;
    const issue = { ...input, id: `uuid-${identifier}`, identifier, url: `https://linear.app/etai/issue/${identifier}` };
    this.issues.push(issue);
    return issue;
  }
  async updateIssue(id: string, input: { description: string; labelIds: string[] }) {
    this.calls.push(`update:${id}`);
    const issue = this.issues.find((i) => i.id === id)!;
    Object.assign(issue, input);
    return issue;
  }
  async resolveTeam(idOrKey: string) {
    this.calls.push(`team:${idOrKey}`);
    return idOrKey === "team" || idOrKey === "ETA" ? { id: "team", key: "ETA", name: "Étai produit" } : null;
  }
  async findLabel(_teamId: string, name: string) {
    return this.labels.get(name) ?? null;
  }
  async findCustomer(externalId: string) {
    return this.customers.get(externalId)?.id ?? null;
  }
  async ensureLabel(_teamId: string, name: string) {
    this.calls.push(`label:${name}`);
    if (!this.labels.has(name)) this.labels.set(name, `label-${this.labels.size + 1}`);
    return this.labels.get(name)!;
  }
  async ensureCustomer(externalId: string, name: string) {
    this.calls.push(`customer:${externalId}`);
    if (this.failCustomers) throw new Error("Customers are not enabled for this workspace");
    if (!this.customers.has(externalId)) this.customers.set(externalId, { id: `cust-${this.customers.size + 1}`, name });
    return this.customers.get(externalId)!.id;
  }
  async hasCustomerNeed(issueId: string, customerId: string) {
    return this.needs.some((n) => n.issueId === issueId && n.customerId === customerId);
  }
  async createCustomerNeed(input: { issueId: string; customerId: string; body: string; attachmentUrl?: string }) {
    this.calls.push("need");
    this.needs.push(input);
  }
}

const decisions = loadPoDecisions(ROOT, "data/po-decisions.json");
const provider = new ReplayProvider(path.join(ROOT, "fixtures/llm"));
const lundi = await runBatch({ root: ROOT, batch: "lundi", provider, reachMode: "comptes", decisions, previous: null });
const jeudi = await runBatch({ root: ROOT, batch: "jeudi", provider, reachMode: "comptes", decisions, previous: lundi.state });
const url = (id: string) => `http://localhost:43217/lundi/feedbacks#${id}`;
const items = (r = lundi) => buildBacklogItems(r, { feedbackUrl: url });
const itemFor = (key: string, r = lundi): BacklogItem => items(r).find((i) => i.themeKey === key)!;

describe("LinearSink", () => {
  it("crée une issue par story validée : story, critères, citations, liens, estimation, label MoSCoW, demandes clients", async () => {
    const api = new FakeLinear();
    const sink = new LinearSink(api, { teamId: "team", feedbackUrl: url });
    const [result] = await sink.push([itemFor("sso_contrat")]);

    expect(result).toMatchObject({ action: "cree", target: "ETA-1", url: "https://linear.app/etai/issue/ETA-1" });
    const issue = api.issues[0]!;
    expect(issue.title).toBe(lundi.state.themes.find((t) => t.key === "sso_contrat")!.title);
    expect(issue.estimate).toBe(6);
    expect(issue.labelIds).toEqual([api.labels.get(moscowLabelName("Must"))]);
    expect(issue.description).toContain("## Story");
    expect(issue.description).toContain("Étant donné");
    expect(issue.description).toMatch(/« .+ »/);
    expect(issue.description).toContain(`[fb-lundi-`);
    expect(issue.description).toContain("etai:sso_contrat");
    expect(api.needs).toHaveLength(itemFor("sso_contrat").details.customers.length);
    expect(api.needs[0]!.attachmentUrl).toMatch(/^http:\/\/localhost:43217\/lundi\/feedbacks#fb-lundi-/);
    expect(result!.notes).toEqual([`${api.needs.length} demande(s) client ajoutée(s).`]);
  });

  it("relancer l'export ne crée ni issue ni demande client en double", async () => {
    const api = new FakeLinear();
    const sink = new LinearSink(api, { teamId: "team" });
    await sink.push([itemFor("synchro_2_4")]);
    const needs = api.needs.length;
    const [again] = await new LinearSink(api, { teamId: "team" }).push([itemFor("synchro_2_4")]);
    expect(again!.action).toBe("inchange");
    expect(api.issues).toHaveLength(1);
    expect(api.needs).toHaveLength(needs);
  });

  it("thème rattaché à LIN-41 : met à jour l'issue existante, garde son texte et son estimation, change le label", async () => {
    const api = new FakeLinear();
    api.seed("LIN-41", "Texte écrit par l'équipe.", ["label-equipe"]);
    const sink = new LinearSink(api, { teamId: "team" });
    const [result] = await sink.push([itemFor("partage_client")]);

    expect(result).toMatchObject({ action: "mis_a_jour", target: "LIN-41" });
    expect(api.calls).not.toContain("create");
    const issue = api.issues[0]!;
    expect(issue.description.startsWith("Texte écrit par l'équipe.")).toBe(true);
    expect(issue.description).toContain("etai:partage_client");
    expect(issue.estimate).toBeUndefined();
    expect(issue.labelIds).toEqual(["label-equipe", api.labels.get(moscowLabelName("Should"))]);

    const [jeudiResult] = await sink.push([itemFor("partage_client", jeudi)]);
    expect(jeudiResult).toMatchObject({ action: "mis_a_jour", target: "LIN-41" });
    expect(api.issues.filter((i) => i.description.includes("etai:partage_client"))).toHaveLength(1);
    const [again] = await sink.push([itemFor("partage_client", jeudi)]);
    expect(again!.action).toBe("inchange");
    const [notif] = await sink.push([itemFor("notifications", jeudi)]);
    expect(notif!.action).toBe("cree");
  });

  it("LIN-xx absente de l'espace Linear : création, avec une note, sans doublon au second export", async () => {
    const api = new FakeLinear();
    const sink = new LinearSink(api, { teamId: "team" });
    const [first] = await sink.push([itemFor("notifications")]);
    expect(first!.action).toBe("cree");
    expect(first!.notes?.[0]).toMatch(/LIN-27 introuvable/);
    const [second] = await sink.push([itemFor("notifications")]);
    expect(second!.action).toBe("inchange");
    expect(api.issues).toHaveLength(1);
  });

  it("un élément à revoir n'est jamais poussé", async () => {
    const api = new FakeLinear();
    const blocked = itemFor("sso_contrat", jeudi);
    expect(blocked.blocked).toMatch(/reconfirmer/);
    const [result] = await new LinearSink(api, { teamId: "team" }).push([blocked]);
    expect(result!.action).toBe("bloque");
    expect(api.calls).toEqual([]);
  });

  it("estimation refusée : issue créée sans estimation ; demandes clients indisponibles : export conservé", async () => {
    const api = new FakeLinear();
    api.failEstimate = true;
    api.failCustomers = true;
    const [result] = await new LinearSink(api, { teamId: "team" }).push([itemFor("synchro_2_4")]);
    expect(result!.action).toBe("cree");
    expect(api.issues[0]!.estimate).toBeUndefined();
    expect(result!.notes).toEqual([
      "Estimation 4 refusée par l'échelle de l'équipe : issue créée sans estimation.",
      "Demandes clients non créées : Customers are not enabled for this workspace.",
    ]);
  });

  it("la section Étai se remplace sans toucher au reste de la description", () => {
    const once = mergeSection("Avant.", "etai:x", "v1");
    const twice = mergeSection(`${once}\n\nAprès.`, "etai:x", "v2");
    expect(twice).toContain("Avant.");
    expect(twice).toContain("Après.");
    expect(twice).toContain("v2");
    expect(twice).not.toContain("v1");
  });
});

describe("cible d'export", () => {
  it("sans clé : MarkdownSink dans out/linear-export, avec la raison", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "etai-export-"));
    const target = exportTarget({ root, env: {} });
    expect(target).toMatchObject({ mode: "markdown", label: "out/linear-export/" });
    expect(target.reason).toMatch(/LINEAR_API_KEY et LINEAR_TEAM_ID absents/);
    const [result] = await target.sink.push([itemFor("sso_contrat")]);
    expect(result!.action).toBe("cree");
    expect(readFileSync(path.join(root, "out/linear-export/sso_contrat.md"), "utf8")).toContain("## Story");
  });

  it("avec clé et équipe : LinearSink, sans appel réel", async () => {
    const api = new FakeLinear();
    const keys: string[] = [];
    const target = exportTarget({
      root: ROOT,
      env: { LINEAR_API_KEY: "lin_api_test", LINEAR_TEAM_ID: "team" },
      api: (key) => {
        keys.push(key);
        return api;
      },
    });
    expect(target).toMatchObject({ mode: "linear", reason: null });
    await target.sink.push([itemFor("sso_contrat")]);
    expect(keys).toEqual(["lin_api_test"]);
    expect(api.issues).toHaveLength(1);
  });

  it("équipe manquante : reste en local", () => {
    expect(exportTarget({ root: ROOT, env: { LINEAR_API_KEY: "x" } }).reason).toMatch(/^LINEAR_TEAM_ID absent :/);
  });
});

describe("équipe Linear et export à blanc", () => {
  it("accepte la clé d'équipe (THI, ETA…) à la place de l'UUID et refuse une équipe inconnue", async () => {
    const api = new FakeLinear();
    const [ok] = await new LinearSink(api, { teamId: "ETA" }).push([itemFor("partage_client")]);
    expect(ok!.action).toBe("cree");
    expect(api.issues.at(-1)!.teamId).toBe("team");
    await expect(new LinearSink(new FakeLinear(), { teamId: "XYZ" }).push([itemFor("partage_client")])).rejects.toThrow(/introuvable : vérifiez LINEAR_TEAM_ID/);
  });

  it("--dry-run lit Linear mais n'écrit rien, et décrit chaque écriture", async () => {
    const api = new FakeLinear();
    api.seed("LIN-41", "Texte écrit par l'équipe.");
    const before = JSON.stringify({ issues: api.issues, labels: [...api.labels], customers: [...api.customers], needs: api.needs });
    const dry = new DryRunLinearApi(api);
    const results = await new LinearSink(dry, { teamId: "ETA", feedbackUrl: url }).push(items());

    expect(JSON.stringify({ issues: api.issues, labels: [...api.labels], customers: [...api.customers], needs: api.needs })).toBe(before);
    expect(api.calls.filter((c) => /^(create|update|label|customer|need)/.test(c))).toEqual([]);
    expect(results.find((r) => r.stableKey === "etai:partage_client")).toMatchObject({ action: "mis_a_jour", target: "LIN-41" });
    expect(results.find((r) => r.stableKey === "etai:sso_contrat")!.action).toBe("cree");
    expect(dry.operations).toContain("Créerait le label « MoSCoW : Must ».");
    expect(dry.operations.some((o) => o.startsWith("Mettrait à jour LIN-41"))).toBe(true);
    expect(dry.operations.some((o) => o.startsWith("Créerait l'issue « SSO"))).toBe(true);
    expect(dry.operations.some((o) => /^Ajouterait une demande client de .+ sur LIN-41/.test(o))).toBe(true);
  });

  it("export à blanc hors ligne (sans clé) : tout est supposé à créer, rien n'est lu", async () => {
    const dry = new DryRunLinearApi(null);
    const results = await new LinearSink(dry, { teamId: "THI" }).push(items(jeudi));
    expect(results.filter((r) => r.action === "bloque").map((r) => r.stableKey).sort()).toEqual(["etai:sso_contrat", "etai:synchro_2_4"]);
    expect(results.filter((r) => r.action !== "bloque").every((r) => r.action === "cree")).toBe(true);
  });
});
