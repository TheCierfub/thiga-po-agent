import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPoDecisions } from "../data/load";
import { ReplayProvider } from "../llm/fixtures";
import { buildRecontactDrafts, writeToOutbox } from "../outbox/recontact";
import { runBatch } from "../pipeline/run";
import { ROOT } from "../test/helpers";
import { NO_OVERRIDES, reprioritize } from "./overrides";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const decisions = loadPoDecisions(ROOT, "data/po-decisions.json");
const provider = new ReplayProvider(path.join(ROOT, "fixtures/llm"));
const lundi = await runBatch({ root: ROOT, batch: "lundi", provider, reachMode: "comptes", decisions, previous: null });
const jeudi = await runBatch({ root: ROOT, batch: "jeudi", provider, reachMode: "comptes", decisions, previous: lundi.state });
const classOf = (a: { decisions: { themeKey: string; moscow: string }[] }) => Object.fromEntries(a.decisions.map((d) => [d.themeKey, d.moscow]));
const sorted = <T extends { themeKey: string }>(xs: T[]) => [...xs].sort((a, b) => a.themeKey.localeCompare(b.themeKey));

describe("arbitrages du PO", () => {
  it("sans arbitrage, le résultat est exactement celui du pipeline", () => {
    for (const r of [lundi, jeudi]) {
      const out = reprioritize(r.state, r.strategy, NO_OVERRIDES);
      expect(out.allocation).toBe(r.state.allocation);
      expect(out.rice).toEqual(r.state.rice);
    }
  });

  it("une taille identique repasse par l'allocation et retrouve les mêmes classes, raisons et alertes", () => {
    for (const r of [lundi, jeudi]) {
      const any = r.state.rice[0]!;
      const out = reprioritize(r.state, r.strategy, { effort: { [any.themeKey]: any.effort.size }, forced: {} });
      expect(sorted(out.allocation.decisions)).toEqual(sorted(r.state.allocation.decisions));
      expect(out.allocation.alerts).toEqual(r.state.allocation.alerts);
      expect(out.allocation.mustPoints).toBe(r.state.allocation.mustPoints);
    }
  });

  it("modifier l'effort recalcule RICE et peut faire changer de classe", () => {
    const before = lundi.state.rice.find((r) => r.themeKey === "partage_client")!;
    const out = reprioritize(lundi.state, lundi.strategy, { effort: { partage_client: "XL" }, forced: {} });
    const after = out.rice.find((r) => r.themeKey === "partage_client")!;
    expect(after.effort).toEqual({ size: "XL", points: 10, source: "po" });
    expect(after.score).toBeCloseTo((before.score * before.effort.points) / 10, 2);
    expect(classOf(out.allocation).partage_client).not.toBe("Should");
  });

  it("forcer une catégorie applique le motif, réserve les points et recalcule les alertes", () => {
    const out = reprioritize(lundi.state, lundi.strategy, {
      effort: {},
      forced: { sso_contrat: { moscow: "Won't", motif: "Client parti, contrat non renouvelé" } },
    });
    const sso = out.allocation.decisions.find((d) => d.themeKey === "sso_contrat")!;
    expect(sso).toMatchObject({ moscow: "Won't", reason: "Forcé par le PO : Client parti, contrat non renouvelé." });
    expect(out.allocation.mustPoints).toBe(lundi.state.allocation.mustPoints - sso.points);
    expect(out.allocation.alerts.map((a) => a.code)).not.toContain("MUST_AU_DELA_DE_60");

    const must = reprioritize(lundi.state, lundi.strategy, { effort: {}, forced: { theme_sombre: { moscow: "Must", motif: "Demande du COMEX" } } });
    expect(classOf(must.allocation).theme_sombre).toBe("Must");
    expect(must.allocation.mustPoints).toBeGreaterThan(lundi.state.allocation.mustPoints);
    expect(must.allocation.alerts.map((a) => a.code)).toContain("MUST_AU_DELA_DE_60");
  });

  it("chaque Won't porte une raison", () => {
    for (const r of [lundi, jeudi]) {
      for (const d of r.state.allocation.decisions.filter((x) => x.moscow === "Won't")) expect(d.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("recontact", () => {
  it("brouillons : investigation du cas flou, et demandes d'identifiant pour les auteurs non rattachés", () => {
    const drafts = buildRecontactDrafts(jeudi.state);
    const inv = drafts.find((d) => d.kind === "investigation")!;
    expect(inv.feedbackId).toBe("fb-lundi-12");
    expect(inv.body).toContain("Nadia, produit Étai");
    expect(inv.questions.length).toBeGreaterThanOrEqual(2);
    for (const d of drafts.filter((x) => x.kind === "identification")) {
      expect(d.accountKnown).toBe(false);
      expect(d.replyMode).not.toBe("reponse_publique");
      expect(d.body).toMatch(/identifiant de votre compte Étai/);
    }
    const all = drafts.map((d) => d.body + d.excerpt).join("\n");
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it("la boîte de test écrit un fichier et n'envoie rien", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "etai-outbox-"));
    const file = writeToOutbox(dir, { feedbackId: "fb-lundi-12", batch: "lundi", channel: "forum_produit", replyMode: "message_prive", recipient: "Rachid", subject: null, body: "Bonjour" }, new Date("2026-11-08T20:00:00Z"));
    expect(path.basename(file)).toBe("2026-11-08T20-00-00-000Z--fb-lundi-12.md");
    expect(readFileSync(file, "utf8")).toContain("n'a été envoyé à personne");
  });
});
