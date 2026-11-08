import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Meter } from "./meter";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

export class OpenRouterHttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`OpenRouter ${path} : HTTP ${status} ${body.slice(0, 300)}`);
    this.name = "OpenRouterHttpError";
  }
}

export interface RawLogEntry {
  at: string;
  step: string;
  key: string;
  model: string;
  error: string;
  /** Corps de la réponse uniquement : jamais d'en-tête ni de clé. */
  raw: unknown;
}

export interface OpenRouterClientOptions {
  apiKey: string;
  /** Racine de l'API, sans `/v1` : https://openrouter.ai/api par défaut. */
  baseUrl?: string;
  fetch?: typeof fetch;
  meter: Meter;
  /** Fichier JSONL où écrire les réponses brutes illisibles. */
  rawLogFile?: string;
  retry?: { attempts: number; delayMs: number };
  generationLookup?: { attempts: number; delayMs: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OpenRouterClient {
  readonly meter: Meter;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenRouterClientOptions) {
    if (!options.apiKey) throw new Error("OPENROUTER_API_KEY est absente.");
    this.meter = options.meter;
    this.baseUrl = (options.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  withMeter(meter: Meter): OpenRouterClient {
    return new OpenRouterClient({ ...this.options, meter });
  }

  logRaw(entry: Omit<RawLogEntry, "at">): void {
    if (!this.options.rawLogFile) return;
    mkdirSync(path.dirname(this.options.rawLogFile), { recursive: true });
    appendFileSync(this.options.rawLogFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.options.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Etai agent PO",
    };
  }

  /** POST avec nouvelle tentative sur 429 et 5xx. Chaque tentative est comptée. */
  async post(
    route: string,
    body: unknown,
    meta: { kind: "chat" | "decision"; step: string; model: string },
  ): Promise<{ json: Record<string, unknown>; latencyMs: number }> {
    const { attempts, delayMs } = this.options.retry ?? { attempts: 3, delayMs: 2000 };
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.meter.assertBudget();
      const started = performance.now();
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${route}`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
        });
      } catch (error) {
        this.meter.record({ ...meta, latencyMs: performance.now() - started, costUsd: null, httpStatus: 0, ok: false });
        lastError = error;
        if (attempt < attempts) await sleep(delayMs * attempt);
        continue;
      }
      const text = await response.text();
      const latencyMs = performance.now() - started;
      if (!response.ok) {
        this.meter.record({ ...meta, latencyMs, costUsd: null, httpStatus: response.status, ok: false });
        lastError = new OpenRouterHttpError(response.status, route, text);
        if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
          await sleep(delayMs * attempt);
          continue;
        }
        throw lastError;
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        this.meter.record({ ...meta, latencyMs, costUsd: null, httpStatus: response.status, ok: false });
        this.logRaw({ step: meta.step, key: "", model: meta.model, error: "corps non JSON", raw: text.slice(0, 5000) });
        throw new OpenRouterHttpError(response.status, route, `corps non JSON : ${text.slice(0, 200)}`);
      }
      const costUsd = await this.costOf(json);
      this.meter.record({ ...meta, latencyMs, costUsd, httpStatus: response.status, ok: true });
      return { json, latencyMs };
    }
    throw lastError;
  }

  /** `usage.cost` si présent, sinon `GET /v1/generation?id=…` (les statistiques arrivent avec un léger décalage). */
  private async costOf(json: Record<string, unknown>): Promise<number | null> {
    const usage = json.usage as { cost?: unknown } | undefined;
    if (typeof usage?.cost === "number") return usage.cost;
    const id = typeof json.id === "string" ? json.id : null;
    if (!id || !/^gen-[0-9A-Za-z-]+$/.test(id)) return null;
    const { attempts, delayMs } = this.options.generationLookup ?? { attempts: 3, delayMs: 1000 };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await sleep(delayMs);
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/v1/generation?id=${encodeURIComponent(id)}`, {
          headers: this.headers(),
        });
        if (response.ok) {
          const body = (await response.json()) as { data?: { total_cost?: unknown } };
          if (typeof body.data?.total_cost === "number") return body.data.total_cost;
        }
      } catch {
        // Le coût reste inconnu ; l'appel est compté comme tel.
      }
    }
    return null;
  }
}
