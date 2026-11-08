import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import type { z } from "zod";
import { loadPoDecisions } from "../data/load";
import type { LlmProvider, LlmRequest } from "../llm/provider";
import { replayRuntime } from "../llm/runtime";
import { runBatch } from "../pipeline/run";

export interface FakeRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown> | null;
}

export interface FakeResponse {
  status?: number;
  body: unknown;
}

export interface FakeServer {
  /** Racine passée au client, comme https://openrouter.ai/api. */
  baseUrl: string;
  requests: FakeRequest[];
  close(): Promise<void>;
}

/** Faux OpenRouter local : aucun appel ne sort de la machine. */
export async function startFakeOpenRouter(handler: (req: FakeRequest) => FakeResponse | Promise<FakeResponse>): Promise<FakeServer> {
  const requests: FakeRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      const fake: FakeRequest = {
        method: req.method ?? "GET",
        path: req.url ?? "",
        headers: req.headers,
        body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
      };
      requests.push(fake);
      Promise.resolve(handler(fake))
        .then(({ status = 200, body }) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(typeof body === "string" ? body : JSON.stringify(body));
        })
        .catch((error: unknown) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(error) }));
        });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/api`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

let generation = 0;
export function chatCompletion(content: unknown, options: { cost?: number | null; id?: string } = {}) {
  const cost = options.cost === undefined ? 0.001 : options.cost;
  return {
    id: options.id ?? `gen-test-${++generation}`,
    model: "fake",
    choices: [{ index: 0, message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, ...(cost === null ? {} : { cost }) },
  };
}

export function userPrompt(body: Record<string, unknown> | null): string {
  const messages = (body?.messages ?? []) as { role: string; content: string }[];
  return messages.find((m) => m.role === "user")?.content ?? "";
}

export function taskOf(body: Record<string, unknown> | null): string {
  return ((body?.response_format as { json_schema?: { name?: string } } | undefined)?.json_schema?.name ?? "") as string;
}

/** Réponses des fixtures de lundi et jeudi, indexées par prompt : ce qu'un modèle « parfait » aurait répondu. */
export async function fixtureAnswersByPrompt(root: string): Promise<Map<string, unknown>> {
  const answers = new Map<string, unknown>();
  const { replay } = replayRuntime(root);
  const capture: LlmProvider = {
    name: "capture",
    async generate<S extends z.ZodType>(request: LlmRequest<S>): Promise<z.infer<S>> {
      const out = await replay.generate(request);
      answers.set(request.prompt, out);
      return out;
    },
  };
  const decisions = loadPoDecisions(root, "data/po-decisions.json");
  const lundi = await runBatch({ root, batch: "lundi", provider: capture, reachMode: "comptes", decisions, previous: null });
  await runBatch({ root, batch: "jeudi", provider: capture, reachMode: "comptes", decisions, previous: lundi.state });
  return answers;
}

/** Réponse valide minimale à une question fermée posée en chat : première option, « non » pour les oui/non. */
export function firstOptionAnswer(body: Record<string, unknown> | null): Record<string, unknown> {
  const schema = (body?.response_format as { json_schema: { schema: { properties: Record<string, { properties: Record<string, { enum?: string[] }> }> } } })
    .json_schema.schema;
  return Object.fromEntries(
    Object.entries(schema.properties).map(([id, q]) => [id, q.properties.choice ? { choice: q.properties.choice.enum![0] } : { yes: false }]),
  );
}
