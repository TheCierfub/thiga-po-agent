import { z } from "zod";
import { LlmOutputError, type LlmProvider, type LlmRequest } from "../provider";
import type { OpenRouterClient } from "./client";

/** Bornes retirées du schéma envoyé : certains fournisseurs les refusent en mode strict. Zod les revérifie ici. */
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "format",
]);

function stripKeywords(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripKeywords);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([k]) => !UNSUPPORTED_KEYWORDS.has(k))
        .map(([k, v]) => [k, k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, stripKeywords(pv)])) : stripKeywords(v)]),
    );
  }
  return node;
}

export function providerJsonSchema(schema: z.ZodType): unknown {
  return stripKeywords(z.toJSONSchema(schema));
}

/** Extrait l'objet JSON d'un contenu de message, même entouré d'une clôture markdown ou de texte. */
export function extractJson(content: unknown): unknown {
  const text = Array.isArray(content)
    ? content.map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text: unknown }).text) : "")).join("")
    : typeof content === "string"
      ? content
      : null;
  if (text === null) throw new Error("message sans contenu texte");
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) return JSON.parse(fenced[1]);
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("aucun objet JSON dans la réponse");
  }
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Tentatives quand la réponse ne respecte pas le schéma (la suivante reçoit l'erreur). */
  maxAttempts?: number;
  /** Exiger d'OpenRouter un fournisseur qui gère tous les paramètres envoyés (response_format compris). */
  requireParameters?: boolean;
}

/** Chat Completions d'OpenRouter, sortie structurée par JSON Schema, aucun outil. */
export class OpenRouterChatProvider implements LlmProvider {
  readonly name: string;

  constructor(
    private readonly client: OpenRouterClient,
    readonly model: string,
    private readonly options: ChatOptions = {},
  ) {
    this.name = `openrouter:${model}`;
  }

  async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
    const maxAttempts = this.options.maxAttempts ?? 2;
    const schema = providerJsonSchema(request.schema);
    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt = lastError
        ? `${request.prompt}\n\nTa réponse précédente était invalide : ${lastError.slice(0, 500)}\nRenvoie uniquement l'objet JSON conforme au schéma.`
        : request.prompt;
      const body = {
        model: this.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: prompt },
        ],
        temperature: this.options.temperature ?? 0,
        max_tokens: this.options.maxTokens ?? 4000,
        response_format: { type: "json_schema", json_schema: { name: request.task, strict: true, schema } },
        ...(this.options.requireParameters ? { provider: { require_parameters: true } } : {}),
      };
      const { json } = await this.client.post("/v1/chat/completions", body, {
        kind: "chat",
        step: request.task,
        model: this.model,
      });
      const choice = (json.choices as { message?: { content?: unknown; refusal?: unknown } }[] | undefined)?.[0];
      try {
        if (choice?.message?.refusal) throw new Error(`refus du modèle : ${String(choice.message.refusal)}`);
        const parsed = request.schema.safeParse(extractJson(choice?.message?.content));
        if (!parsed.success) throw new Error(parsed.error.message);
        return parsed.data;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.client.meter.addSchemaError();
        this.client.logRaw({ step: request.task, key: request.key, model: this.model, error: lastError, raw: json });
      }
    }
    throw new LlmOutputError(request.task, request.key, `${maxAttempts} réponses hors schéma. Dernière erreur : ${lastError}`);
  }
}
