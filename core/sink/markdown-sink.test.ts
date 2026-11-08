import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stableKey, type BacklogItem } from "./backlog-sink";
import { LinearSink, NotImplementedInPhase1Error } from "./linear-sink";
import { MarkdownSink } from "./markdown-sink";

const item = (themeKey: string, body: string, blocked: string | null = null): BacklogItem => ({
  stableKey: stableKey(themeKey),
  themeKey,
  title: themeKey,
  moscow: "Should",
  existingIssueId: null,
  body,
  blocked,
});

describe("MarkdownSink", () => {
  it("crée une fois, puis ne réécrit rien tant que le contenu ne change pas", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sink-"));
    const sink = new MarkdownSink(dir);
    expect((await sink.push([item("partage", "v1")]))[0]!.action).toBe("cree");
    expect((await sink.push([item("partage", "v1")]))[0]!.action).toBe("inchange");
    expect((await sink.push([item("partage", "v2")]))[0]!.action).toBe("mis_a_jour");
    expect(readdirSync(dir).sort()).toEqual(["manifest.json", "partage.md"]);
    expect(readFileSync(path.join(dir, "partage.md"), "utf8")).toBe("v2");
  });

  it("retrouve l'élément par sa clé stable avec un nouveau sink", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sink-"));
    await new MarkdownSink(dir).push([item("sso", "v1")]);
    expect((await new MarkdownSink(dir).push([item("sso", "v1")]))[0]!.action).toBe("inchange");
  });

  it("n'écrit pas un élément bloqué et laisse la version précédente intacte", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sink-"));
    const sink = new MarkdownSink(dir);
    await sink.push([item("synchro", "confirmé")]);
    const [result] = await sink.push([item("synchro", "nouvelle version", "à reconfirmer")]);
    expect(result!.action).toBe("bloque");
    expect(readFileSync(path.join(dir, "synchro.md"), "utf8")).toBe("confirmé");
  });
});

describe("LinearSink", () => {
  it("refuse toute écriture en phase 1", async () => {
    await expect(new LinearSink().push([item("x", "y")])).rejects.toBeInstanceOf(NotImplementedInPhase1Error);
  });
});
