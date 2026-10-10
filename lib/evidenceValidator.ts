// Evidence validator (spec section 8). The model returns only a quote; code finds the offsets.
// A quote that cannot be found verbatim (after whitespace/quote-mark normalization) is rejected.
import type { ChartDocument, Evidence } from "./types";

const normChar = (ch: string) =>
  ch
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .toLowerCase();

const norm = (s: string) => normChar(s).replace(/\s+/g, " ").trim();

export function locateQuote(docText: string, quote: string): { start: number; end: number } | null {
  const q = norm(quote).replace(/^["']+|["']+$/g, "").trim();
  if (q.length < 4) return null;
  // Normalized copy of the doc plus a map from normalized index -> original index.
  let normDoc = "";
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < docText.length; i++) {
    const isSpace = /\s/.test(docText[i]);
    if (isSpace && lastWasSpace) continue;
    const ch = isSpace ? " " : normChar(docText[i]);
    // NFKC can expand one char into several; map each produced char back to i.
    for (const c of ch) { normDoc += c; map.push(i); }
    lastWasSpace = isSpace;
  }
  const idx = normDoc.indexOf(q);
  if (idx === -1) return null;
  return { start: map[idx], end: map[idx + q.length - 1] + 1 };
}

export interface ValidationStats { verified: number; returned: number; dropped: { quote: string; doc_id: string }[] }

export function newStats(): ValidationStats {
  return { verified: 0, returned: 0, dropped: [] };
}

/**
 * Validates a model-returned {quote, doc_id}. Falls back to searching every chart document when the
 * doc_id is wrong but the quote exists elsewhere (the quote is what matters, not the model's doc label).
 */
export function validateEvidence(
  docs: ChartDocument[],
  quote: string,
  docId: string | undefined,
  stats?: ValidationStats,
): Evidence | null {
  if (stats) stats.returned++;
  const ordered = [...docs].sort((a, b) => (a.doc_id === docId ? -1 : b.doc_id === docId ? 1 : 0));
  for (const d of ordered) {
    const loc = locateQuote(d.text, quote);
    if (loc) {
      if (stats) stats.verified++;
      return { quote: d.text.slice(loc.start, loc.end), doc_id: d.doc_id, char_start: loc.start, char_end: loc.end };
    }
  }
  if (stats) stats.dropped.push({ quote, doc_id: docId ?? "?" });
  return null;
}
