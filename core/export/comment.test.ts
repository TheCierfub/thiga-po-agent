import { describe, expect, it } from "vitest";
import type { Feedback, LinearExport, Theme } from "../schemas";
import type { RunState } from "../pipeline/state";
import { annotateEngagedFeedback, commentBody, feedbackLinearMark, feedbackMarker, type LinearComments } from "./comment";

const KEY = "lin_api_secret_ne_pas_afficher";

function theme(): Theme {
  return {
    key: "partage",
    title: "Partage",
    problem: "p",
    kind: "produit",
    feedbackIds: ["fb-old", "fb-new"],
    relatedSignalIds: [],
    backlogIssueId: null,
    backlogRelation: "aucun",
    quotes: [{ feedbackId: "fb-new", text: "le client ne voit rien" }],
    rejectedQuotes: [],
    trend: { kind: "ponctuel", weeklyCounts: [0, 0, 0, 1], rule: "un" },
    hasCriticalBug: false,
    firstSeenBatch: "jeudi",
    linearExport: {
      id: "uuid-1",
      identifier: "THI-20",
      url: "https://linear.app/thiga/issue/THI-20",
      exportedAt: "2026-11-10T10:00:00.000Z",
      feedbackIds: ["fb-old"],
      comments: [],
      pending: [],
    },
  } as Theme;
}

function feedback(): Feedback {
  return {
    id: "fb-new",
    batch: "jeudi",
    channel: "email",
    receivedAt: "2026-11-10T09:00:00+01:00",
    author: { name: "Jean", email: null, handle: null, anonymous: false },
    sourceAccountId: "acc-1",
    language: "fr",
    text: "le client ne voit rien",
  };
}

function state(): RunState {
  return {
    themes: [theme()],
    rice: [{ themeKey: "partage", reach: { accounts: ["acc-1", "acc-2"] } }],
    matches: [{ feedbackId: "fb-new", accountId: "acc-1" }],
    classifications: [],
  } as unknown as RunState;
}

describe("commentaire après export", () => {
  it("décrit la citation, l'entreprise, le canal, la date et le Reach", () => {
    const body = commentBody({
      feedbackId: "fb-new",
      quote: "le client ne voit rien",
      company: "Marée & Fils",
      channel: "E-mail",
      receivedAt: "2026-11-10T09:00:00+01:00",
      reachBefore: 1,
      reachAfter: 2,
    });
    expect(body).toContain(feedbackMarker("fb-new"));
    expect(body).toContain("Marée & Fils · E-mail ·");
    expect(body).toContain("> le client ne voit rien");
    expect(body).toContain("Reach : 1 → 2 comptes");
    expect(body).not.toContain(KEY);
  });

  it("poste une fois, et un second essai ne crée pas de doublon", async () => {
    const comments: string[] = [];
    const linear: LinearComments = {
      async listComments() {
        return comments.map((body) => ({ body }));
      },
      async createComment(input) {
        comments.push(input.body);
      },
    };
    const accounts = [{ id: "acc-1", nom: "Marée & Fils" }] as never;
    const first = await annotateEngagedFeedback(state(), feedback(), accounts, 1, linear);
    const second = await annotateEngagedFeedback(first, feedback(), accounts, 1, linear);
    expect(comments).toHaveLength(1);
    expect(first.themes[0]?.linearExport?.comments.map((item) => item.feedbackId)).toEqual(["fb-new"]);
    expect(second.themes[0]?.linearExport?.comments).toHaveLength(1);
    expect(feedbackLinearMark(first.themes, "fb-old")?.text).toBe("Traité · THI-20");
    expect(feedbackLinearMark(first.themes, "fb-new")?.text).toBe("Ajouté à THI-20");
  });

  it("met le feedback en attente si Linear échoue, sans planter", async () => {
    const linear: LinearComments = {
      async listComments() {
        throw new Error(`unauthorized ${KEY}`);
      },
      async createComment() {
        throw new Error("ne doit pas être appelé");
      },
    };
    const next = await annotateEngagedFeedback(state(), feedback(), [], 1, linear);
    const pending = next.themes[0]?.linearExport?.pending[0];
    expect(pending?.feedbackId).toBe("fb-new");
    expect(pending?.message).toMatch(/attente/);
    expect(JSON.stringify(next.themes[0]?.linearExport)).not.toContain(KEY);
    expect(feedbackLinearMark(next.themes, "fb-new")?.tone).toBe("attente");
  });

  it("reconnaît un commentaire déjà présent sur l'issue", async () => {
    let created = 0;
    const linear: LinearComments = {
      async listComments() {
        return [{ body: `déjà là\n\n${feedbackMarker("fb-new")}` }];
      },
      async createComment() {
        created += 1;
      },
    };
    const next = await annotateEngagedFeedback(state(), feedback(), [], 1, linear);
    expect(created).toBe(0);
    expect(next.themes[0]?.linearExport?.comments).toHaveLength(1);
  });
});

describe("thème non exporté", () => {
  it("ne marque pas le feedback", () => {
    const bare = theme();
    delete (bare as { linearExport?: LinearExport }).linearExport;
    expect(feedbackLinearMark([bare], "fb-old")).toBeNull();
  });
});
