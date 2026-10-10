// LLM wrapper: Claude, Groq, or Ollama, all returning Zod-validated JSON.
// When neither is configured or a call fails, agents fall back to the offline rules engine
// (lib/rules.ts); the pipeline records which provider produced each step.
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Provider } from "./types";

export function configuredProvider(): Provider {
  const p = (process.env.LLM_PROVIDER || "auto").toLowerCase();
  if (p === "claude" || p === "groq" || p === "ollama" || p === "rules") return p;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "claude";
  if (process.env.GROQ_API_KEY) return "groq";
  return "rules";
}

export const claudeModel = () => process.env.CLAUDE_MODEL || "claude-opus-5";
export const groqModel = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export function providerLabel(p: Provider | null | undefined) {
  if (p === "claude") return `Claude (${claudeModel()})`;
  if (p === "groq") return `Groq (${groqModel()})`;
  if (p === "ollama") return `Ollama (${process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct"})`;
  if (p === "rules") return "Offline rules engine";
  return "Not run";
}

export class LlmError extends Error {
  constructor(message: string, readonly unavailable = false) {
    super(message);
  }
}

// Circuit breaker: after a network or credential failure, skip the LLM for 60 s so the rest of the
// run falls back to the rules engine immediately instead of waiting on retries for every step.
let blockedUntil = 0;
let blockedReason = "";

function jsonSchemaFor(schema: z.ZodTypeAny) {
  const js = zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 90_000 }));

interface StructuredArgs<T extends z.ZodTypeAny> {
  system: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
}

async function claudeStructured<T extends z.ZodTypeAny>(a: StructuredArgs<T>): Promise<z.infer<T>> {
  let response: Anthropic.Message;
  try {
    response = await anthropic().messages.create({
      model: claudeModel(),
      max_tokens: a.maxTokens ?? 16000,
      system: a.system,
      messages: [{ role: "user", content: a.prompt }],
      // Extraction and matching are well specified; medium effort keeps stage latency low.
      output_config: { effort: "medium", format: { type: "json_schema", schema: jsonSchemaFor(a.schema) } },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new LlmError("Claude: invalid or missing API key", true);
    if (error instanceof Anthropic.RateLimitError) throw new LlmError("Claude: rate limited");
    if (error instanceof Anthropic.BadRequestError) throw new LlmError(`Claude: bad request (${error.message})`);
    if (error instanceof Anthropic.APIConnectionError) throw new LlmError("Claude: network unavailable", true);
    if (error instanceof Anthropic.APIError) throw new LlmError(`Claude API error ${error.status}`);
    if (error instanceof Anthropic.AnthropicError) throw new LlmError(`Claude: ${error.message}`, true);
    throw error;
  }
  if (response.stop_reason === "refusal") throw new LlmError("Claude declined the request");
  if (response.stop_reason === "max_tokens") throw new LlmError("Claude output was truncated");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return parseAndValidate(a.schema, text, "Claude");
}

async function ollamaStructured<T extends z.ZodTypeAny>(a: StructuredArgs<T>): Promise<z.infer<T>> {
  const url = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct",
        stream: false,
        format: jsonSchemaFor(a.schema),
        options: { temperature: 0.1 },
        messages: [
          { role: "system", content: a.system },
          { role: "user", content: a.prompt },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new LlmError("Ollama: server not reachable", true);
  }
  if (!res.ok) throw new LlmError(`Ollama error ${res.status}`);
  const body = (await res.json()) as { message?: { content?: string } };
  return parseAndValidate(a.schema, body.message?.content ?? "", "Ollama");
}

// Groq: OpenAI-compatible chat completions. Tries JSON-schema structured output first; models that do
// not support it get JSON mode with the schema in the system prompt. Zod validates either way.
let groqSchemaUnsupported = false;

async function groqStructured<T extends z.ZodTypeAny>(a: StructuredArgs<T>): Promise<z.infer<T>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new LlmError("Groq: GROQ_API_KEY is not set", true);
  const schema = jsonSchemaFor(a.schema);
  const useSchema = !groqSchemaUnsupported && process.env.GROQ_JSON_MODE !== "object";
  const system = useSchema
    ? `${a.system}
Respond with JSON only.`
    : `${a.system}
Respond with a single JSON object only, no prose, matching this JSON schema exactly:
${JSON.stringify(schema)}`;
  const body = {
    model: groqModel(),
    temperature: 0.1,
    max_completion_tokens: a.maxTokens ?? 8192,
    messages: [
      { role: "system", content: system },
      { role: "user", content: a.prompt },
    ],
    response_format: useSchema ? { type: "json_schema", json_schema: { name: "output", schema } } : { type: "json_object" },
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new LlmError("Groq: network unavailable", true);
    }
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") throw new LlmError("Groq output was truncated");
      return parseAndValidate(a.schema, choice?.message?.content ?? "", "Groq");
    }
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new LlmError("Groq: invalid API key", true);
    if (res.status === 404) throw new LlmError(`Groq: model "${groqModel()}" not found. Set GROQ_MODEL in .env.local`, true);
    if (res.status === 400 && useSchema && /response_format|json_schema|structured/i.test(text)) {
      groqSchemaUnsupported = true; // this model has no JSON-schema mode: retry with JSON mode
      return groqStructured(a);
    }
    if (res.status === 429 || res.status >= 500) {
      // Free-tier rate limits are per minute: wait as instructed (max 20 s), then retry.
      const wait = Math.min(20, Number(res.headers.get("retry-after")) || 2 ** attempt * 2);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    throw new LlmError(`Groq error ${res.status}: ${text.slice(0, 200)}`);
  }
  throw new LlmError("Groq: rate limited after 3 attempts");
}

function parseAndValidate<T extends z.ZodTypeAny>(schema: T, text: string, who: string): z.infer<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError(`${who} returned invalid JSON`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new LlmError(`${who} output failed schema validation`);
  return parsed.data;
}

/** Structured JSON from the configured LLM. Throws LlmError for the caller to fall back to rules. */
export async function structured<T extends z.ZodTypeAny>(provider: Provider, a: StructuredArgs<T>): Promise<z.infer<T>> {
  if (Date.now() < blockedUntil) throw new LlmError(`${blockedReason} (skipping the LLM for a minute)`);
  try {
    if (provider === "claude") return await claudeStructured(a);
    if (provider === "groq") return await groqStructured(a);
    if (provider === "ollama") return await ollamaStructured(a);
  } catch (e) {
    if (e instanceof LlmError && e.unavailable) {
      blockedUntil = Date.now() + 60_000;
      blockedReason = e.message;
    }
    throw e;
  }
  throw new LlmError("No LLM provider configured");
}
