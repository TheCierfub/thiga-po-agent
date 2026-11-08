import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CORE = import.meta.dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return e.name.endsWith(".ts") ? [full] : [];
  });
}

describe("frontière de core/", () => {
  it("n'importe ni React ni Next, ni rien de app/", () => {
    const offenders = sourceFiles(CORE).filter((file) =>
      /from\s+["'](react|react-dom|next)(\/[^"']*)?["']|from\s+["'](@\/app|\.\.\/+app)\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
