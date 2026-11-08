import path from "node:path";
import type { BacklogSink } from "./backlog-sink";
import { SdkLinearApi } from "./linear-api";
import { LinearSink, type LinearApi } from "./linear-sink";
import { MarkdownSink } from "./markdown-sink";

export const LINEAR_EXPORT_DIR = "out/linear-export";

export interface ExportTarget {
  sink: BacklogSink;
  mode: "linear" | "markdown";
  /** Où part l'export, en clair pour l'interface. */
  label: string;
  /** Pourquoi l'export reste local, le cas échéant. */
  reason: string | null;
}

/** Linear si LINEAR_API_KEY et LINEAR_TEAM_ID sont définis, sinon export local dans out/linear-export/. */
export function exportTarget(options: {
  root: string;
  env?: Partial<Record<string, string>>;
  feedbackUrl?: (feedbackId: string) => string;
  api?: (apiKey: string) => LinearApi;
}): ExportTarget {
  const env = options.env ?? process.env;
  const apiKey = env.LINEAR_API_KEY?.trim();
  const teamId = env.LINEAR_TEAM_ID?.trim();
  if (apiKey && teamId) {
    const api = (options.api ?? SdkLinearApi.fromKey)(apiKey);
    return {
      sink: new LinearSink(api, { teamId, feedbackUrl: options.feedbackUrl, customerRequests: env.LINEAR_CUSTOMER_REQUESTS !== "0" }),
      mode: "linear",
      label: "Linear",
      reason: null,
    };
  }
  const missing = [!apiKey && "LINEAR_API_KEY", !teamId && "LINEAR_TEAM_ID"].filter(Boolean).join(" et ");
  return {
    sink: new MarkdownSink(path.join(options.root, LINEAR_EXPORT_DIR)),
    mode: "markdown",
    label: `${LINEAR_EXPORT_DIR}/`,
    reason: `${missing} absent${missing.includes(" et ") ? "s" : ""} : export local en Markdown, rien n'est envoyé à Linear.`,
  };
}
