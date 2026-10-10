// Embeddings with BAAI/bge-small-en-v1.5 (384-dim) via transformers.js, running locally in Node.
// Policies are embedded once by scripts/ingest-policies.ts; at request time only the short query is embedded.
// If the model cannot load (first run offline, unsupported platform), retrieval falls back to lexical
// scoring and the timeline says so.
import path from "node:path";

type Extractor = (text: string, opts: { pooling: "cls" | "mean"; normalize: boolean }) => Promise<{ data: Float32Array }>;

const g = globalThis as unknown as { __pacExtractor?: Promise<Extractor | null> };

async function loadExtractor(): Promise<Extractor | null> {
  try {
    const t = await import("@xenova/transformers");
    t.env.cacheDir = path.join(process.cwd(), ".cache", "transformers");
    t.env.allowLocalModels = true;
    return (await t.pipeline("feature-extraction", "Xenova/bge-small-en-v1.5")) as unknown as Extractor;
  } catch (e) {
    console.warn("[embed] bge-small unavailable, using lexical retrieval:", (e as Error).message);
    return null;
  }
}

export const EMBED_MODEL = "BAAI/bge-small-en-v1.5";
// bge recommends this instruction prefix for short retrieval queries (not for passages).
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

async function embed(text: string): Promise<number[] | null> {
  g.__pacExtractor ??= loadExtractor();
  const extractor = await g.__pacExtractor;
  if (!extractor) return null;
  const out = await extractor(text, { pooling: "cls", normalize: true });
  return Array.from(out.data);
}

export const embedPassage = (text: string) => embed(text);
export const embedQuery = (text: string) => embed(QUERY_PREFIX + text);

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Lexical fallback: share of query terms present in the passage. */
export function lexicalScore(query: string, passage: string) {
  const q = new Set(tokens(query).filter((t) => t.length > 2));
  const p = new Set(tokens(passage));
  let hit = 0;
  q.forEach((t) => { if (p.has(t)) hit++; });
  return q.size ? hit / q.size : 0;
}
