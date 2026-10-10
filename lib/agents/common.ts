import { LlmError } from "../llm";
import type { ChartDocument, Provider } from "../types";

export interface StepResult<T> {
  value: T;
  used: Provider;
  warning?: string;
}

/** Runs the LLM version of a step, falling back to the offline rules engine on any LLM failure. */
export async function withFallback<T>(
  provider: Provider,
  llm: () => Promise<T>,
  rules: () => T | Promise<T>,
): Promise<StepResult<T>> {
  if (provider === "rules") return { value: await rules(), used: "rules" };
  try {
    return { value: await llm(), used: provider };
  } catch (e) {
    const reason = e instanceof LlmError ? e.message : `Unexpected error: ${(e as Error).message}`;
    console.warn(`[pipeline] ${reason}. Falling back to the offline rules engine.`);
    return { value: await rules(), used: "rules", warning: `${reason}. Used the offline rules engine for this step.` };
  }
}

export function chartForPrompt(docs: ChartDocument[]) {
  return docs
    .map((d) => `<document doc_id="${d.doc_id}" type="${d.type}" title="${d.title}" date="${d.date}">\n${d.text}\n</document>`)
    .join("\n\n");
}

export const QUOTE_RULES =
  "Every quote must be copied character for character from the chart, as one continuous span (a sentence or clause). " +
  "Never paraphrase, merge, or shorten a quote with ellipses. If you cannot find a verbatim quote, leave the item out.";
