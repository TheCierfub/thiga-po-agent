import { connection } from "next/server";

export interface ExportMode {
  mode: "linear" | "markdown";
  missing: string[];
}

/** Lit l'environnement à la requête : brancher Linear ne demande qu'un redémarrage, pas un rebuild. */
export async function readExportMode(): Promise<ExportMode> {
  await connection();
  const missing = ["LINEAR_API_KEY", "LINEAR_TEAM_ID"].filter((name) => !process.env[name]?.trim());
  return { mode: missing.length === 0 ? "linear" : "markdown", missing };
}
