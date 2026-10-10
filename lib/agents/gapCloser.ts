// Step 4: Gap-closer. Turns every required MISSING / UNCLEAR criterion into one specific question
// for the right person. Existing gap history is kept when the pipeline re-runs.
import { structured } from "../llm";
import { CPT } from "../codes";
import { rulesGaps } from "../rules";
import { GapSchema, type GapOut } from "../schemas";
import type { Criterion, Fact, Gap, MatchResult, Provider } from "../types";
import { withFallback } from "./common";

const SYSTEM = `You are the gap-closing agent of a prior-authorization assistant.
For each criterion that is not met, write exactly one short, specific question for the person who can fix it.
Name the numbers (for example "PT documented is 4 weeks. Policy needs 6."). Say what to add: a record, a note, or a clinical reason.
Physicians answer clinical documentation gaps; coordinators fetch missing reports. Plain language, no more than two sentences.`;

export function gapCriteria(criteria: Criterion[], results: MatchResult[]) {
  return results.filter((r) => {
    const c = criteria.find((x) => x.id === r.criterion_id);
    return c?.required && !r.not_applicable && r.status !== "MET";
  });
}

export async function runGapCloser(
  criteria: Criterion[],
  results: MatchResult[],
  facts: Fact[],
  procedure: string,
  previous: Gap[],
  provider: Provider,
) {
  const targets = gapCriteria(criteria, results);
  const region = CPT[procedure]?.region === "lumbar" ? "lumbar spine" : "knee";
  const rules = () => rulesGaps(criteria, results, facts, region);
  const step =
    targets.length === 0
      ? { value: { gaps: [] } as GapOut, used: provider, warning: undefined }
      : await withFallback<GapOut>(
          provider,
          () =>
            structured(provider, {
              system: SYSTEM,
              prompt: JSON.stringify(
                targets.map((r) => ({ criterion: criteria.find((c) => c.id === r.criterion_id), status: r.status, reasoning: r.reasoning, evidence: r.evidence.map((e) => e.quote) })),
                null,
                2,
              ),
              schema: GapSchema,
            }),
          rules,
        );

  // Exactly one question per target criterion; fill any the model skipped from the rules engine.
  const fallback = rules().gaps;
  const now = new Date().toISOString();
  const gaps: Gap[] = [];
  for (const r of targets) {
    const q = step.value.gaps.find((g) => g.criterion_id === r.criterion_id) ?? fallback.find((g) => g.criterion_id === r.criterion_id);
    const prev = previous.find((g) => g.criterion_id === r.criterion_id && g.status !== "resolved");
    if (prev && prev.status !== "open") { gaps.push(prev); continue; } // confirmed missing / N/A stays closed
    gaps.push({
      id: prev?.id ?? `G-${r.criterion_id}`,
      criterion_id: r.criterion_id,
      question: q?.question ?? `Provide evidence for criterion ${r.criterion_id}.`,
      target_role: q?.target_role ?? "physician",
      status: "open",
    });
  }
  // Keep history: gaps whose criterion is now met are shown as resolved.
  for (const g of previous) {
    if (gaps.some((x) => x.criterion_id === g.criterion_id)) continue;
    gaps.push(g.status === "open" ? { ...g, status: "resolved", resolved_at: g.resolved_at ?? now, resolution: g.resolution ?? "Criterion met after re-check" } : g);
  }
  return { gaps, used: step.used, warning: step.warning };
}
