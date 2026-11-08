import type { EvalReport, Metric } from "./evaluate";
import { formatRatio } from "./metrics";

export function formatValue(value: Metric["value"]): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toFixed(2);
  return formatRatio(value);
}

export function renderMetrics(report: EvalReport): string[] {
  const lines: string[] = [];
  let section = "";
  for (const m of report.metrics) {
    if (m.section !== section) {
      section = m.section;
      lines.push("", `## ${section}`, "", "| Mesure | Résultat | Détail |", "| --- | --- | --- |");
    }
    lines.push(`| ${m.name} | ${formatValue(m.value)} | ${m.detail.replaceAll("|", "\\|")} |`);
  }
  return lines;
}
