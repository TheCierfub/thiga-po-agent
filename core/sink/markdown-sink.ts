import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { hashOf } from "../util/hash";
import type { BacklogItem, BacklogSink, SinkResult } from "./backlog-sink";

const ManifestSchema = z.record(z.string(), z.object({ file: z.string(), contentHash: z.string() }));
type Manifest = z.infer<typeof ManifestSchema>;

/**
 * Écrit un fichier par élément dans un dossier local. Le manifeste associe chaque clé stable à son
 * fichier et à l'empreinte du contenu : relancer le même lot ne recrée rien et ne réécrit rien.
 */
export class MarkdownSink implements BacklogSink {
  readonly name = "markdown";
  constructor(private readonly dir: string) {}

  private get manifestPath() {
    return path.join(this.dir, "manifest.json");
  }

  private readManifest(): Manifest {
    if (!existsSync(this.manifestPath)) return {};
    return ManifestSchema.parse(JSON.parse(readFileSync(this.manifestPath, "utf8")));
  }

  async push(items: BacklogItem[]): Promise<SinkResult[]> {
    mkdirSync(this.dir, { recursive: true });
    const manifest = this.readManifest();
    const results: SinkResult[] = [];

    for (const item of items) {
      const known = manifest[item.stableKey];
      if (item.blocked) {
        results.push({ stableKey: item.stableKey, action: "bloque", target: known?.file ?? null, reason: item.blocked });
        continue;
      }
      const file = known?.file ?? `${item.themeKey}.md`;
      const contentHash = hashOf(item.body);
      if (known && known.contentHash === contentHash && existsSync(path.join(this.dir, file))) {
        results.push({ stableKey: item.stableKey, action: "inchange", target: file });
        continue;
      }
      writeFileSync(path.join(this.dir, file), item.body);
      manifest[item.stableKey] = { file, contentHash };
      results.push({ stableKey: item.stableKey, action: known ? "mis_a_jour" : "cree", target: file });
    }

    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(this.manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
    return results;
  }
}
