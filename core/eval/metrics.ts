export interface Ratio {
  ok: number;
  total: number;
}

export function ratio(ok: number, total: number): Ratio {
  return { ok, total };
}

export function formatRatio(r: Ratio): string {
  if (r.total === 0) return "n/a";
  return `${r.ok}/${r.total} (${Math.round((r.ok / r.total) * 100)} %)`;
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

export interface ThemeMatch {
  expected: string;
  found: string | null;
  score: number;
}

/** Appariement glouton par Jaccard décroissant ; un thème trouvé ne sert qu'une fois. */
export function matchThemes(
  expected: Record<string, readonly string[]>,
  found: Record<string, readonly string[]>,
  threshold = 0.5,
): { matches: ThemeMatch[]; unmatchedFound: string[] } {
  const pairs: { e: string; f: string; s: number }[] = [];
  for (const [e, ids] of Object.entries(expected)) {
    for (const [f, fids] of Object.entries(found)) pairs.push({ e, f, s: jaccard(ids, fids) });
  }
  pairs.sort((x, y) => y.s - x.s || x.e.localeCompare(y.e) || x.f.localeCompare(y.f));
  const usedE = new Set<string>();
  const usedF = new Set<string>();
  const matches: ThemeMatch[] = [];
  for (const p of pairs) {
    if (p.s < threshold || usedE.has(p.e) || usedF.has(p.f)) continue;
    usedE.add(p.e);
    usedF.add(p.f);
    matches.push({ expected: p.e, found: p.f, score: p.s });
  }
  for (const e of Object.keys(expected)) {
    if (!usedE.has(e)) matches.push({ expected: e, found: null, score: 0 });
  }
  return {
    matches: matches.sort((a, b) => a.expected.localeCompare(b.expected)),
    unmatchedFound: Object.keys(found).filter((f) => !usedF.has(f)),
  };
}

export function setScores(predicted: readonly string[], expected: readonly string[]) {
  const p = new Set(predicted);
  const e = new Set(expected);
  const tp = [...p].filter((x) => e.has(x));
  return {
    precision: ratio(tp.length, p.size),
    recall: ratio(tp.length, e.size),
    falsePositives: [...p].filter((x) => !e.has(x)),
    falseNegatives: [...e].filter((x) => !p.has(x)),
  };
}

/** Extrait la classe MoSCoW d'un libellé libre de la clé (« Must, à confirmer par le PO » → Must). */
export function moscowFromLabel(label: string): string | null {
  const m = label.match(/\b(Must|Should|Could|Won't)\b|hors arbitrage/i);
  if (!m) return null;
  return m[1] ?? "Hors arbitrage";
}
