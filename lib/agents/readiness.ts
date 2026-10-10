// Step 7: Readiness score (spec 7.7). A transparent checklist score, not an approval probability.
//   score = 100 * (sum of weight of MET criteria) / (sum of weight of all criteria)
//   weight: required = 2, optional = 1; UNCLEAR counts as half its weight
//   capped at 60 if any required criterion is MISSING
// Optional exception criteria that do not apply are excluded from the denominator.
import type { Criterion, MatchResult, Readiness } from "../types";

export const READINESS_FORMULA = [
  "score = 100 x (sum of weights of MET criteria) / (sum of weights of all criteria)",
  "weight: required = 2, optional = 1",
  "UNCLEAR counts as 0.5 of its weight",
  "capped at 60 if any required criterion is MISSING",
  "criteria marked not applicable are excluded",
];

export function computeReadiness(criteria: Criterion[], results: MatchResult[]): Readiness {
  let met = 0;
  let total = 0;
  let requiredMissing = false;
  const fixes: string[] = [];
  for (const c of criteria) {
    const r = results.find((x) => x.criterion_id === c.id);
    if (!r || r.not_applicable) continue;
    const w = c.required ? 2 : 1;
    total += w;
    if (r.status === "MET") met += w;
    else if (r.status === "UNCLEAR") {
      met += w / 2;
      fixes.push(`Clarify ${c.id} (${c.title}): ${r.reasoning}`);
    } else {
      if (c.required) requiredMissing = true;
      fixes.push(`Add evidence for ${c.id} (${c.title}): ${r.reasoning}`);
    }
  }
  const raw = total ? Math.round((100 * met) / total) : 0;
  const capped = requiredMissing && raw > 60;
  return { score: capped ? 60 : raw, capped: requiredMissing, met_weight: met, total_weight: total, fixes };
}
