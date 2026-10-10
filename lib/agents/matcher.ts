// Step 3: Criteria matcher. Marks each criterion MET / MISSING / UNCLEAR with verbatim evidence.
// Code check: every quote must pass the evidence validator; a MET with no valid quote becomes UNCLEAR.
import { structured } from "../llm";
import { rulesMatch } from "../rules";
import { MatchSchema, type MatchOut } from "../schemas";
import { validateEvidence, type ValidationStats } from "../evidenceValidator";
import type { ChartDocument, Criterion, Fact, MatchResult, Provider } from "../types";
import { chartForPrompt, QUOTE_RULES, withFallback } from "./common";

const SYSTEM = `You are the criteria-matching agent of a prior-authorization assistant.
For each insurer criterion, decide from the chart whether it is MET, MISSING, or UNCLEAR.
- MET: the chart explicitly satisfies it. Cite at least one verbatim quote.
- MISSING: the chart clearly does not satisfy it (for example 4 weeks documented when 6 are required), or nothing is documented.
- UNCLEAR: something related is mentioned but not enough to decide. When unsure, choose UNCLEAR. Never guess.
If a criterion can be waived by an exception criterion and that exception is documented, the waived criterion is MET.
For an exception criterion (is_exception true) that is not documented, return MISSING with applicable false.
Keep reasoning to one short sentence that names the numbers involved.
${QUOTE_RULES}`;

export async function runMatcher(
  criteria: Criterion[],
  facts: Fact[],
  docs: ChartDocument[],
  provider: Provider,
  stats: ValidationStats,
) {
  const step = await withFallback<MatchOut["results"]>(
    provider,
    async () =>
      (
        await structured(provider, {
          system: SYSTEM,
          prompt: [
            `Criteria:\n${JSON.stringify(criteria, null, 2)}`,
            `Facts extracted by the intake agent:\n${JSON.stringify(facts.map(({ char_start, char_end, ...f }) => f), null, 2)}`,
            `Patient chart:\n\n${chartForPrompt(docs)}`,
          ].join("\n\n"),
          schema: MatchSchema,
        })
      ).results,
    () => rulesMatch(criteria, facts),
  );

  const results: MatchResult[] = criteria.map((c) => {
    const raw = step.value.find((r) => r.criterion_id === c.id);
    if (!raw) {
      return { criterion_id: c.id, status: "UNCLEAR", not_applicable: false, evidence: [], reasoning: "No result was returned for this criterion; needs human review.", decided_by: "ai" };
    }
    const evidence = raw.evidence
      .map((e) => validateEvidence(docs, e.quote, e.doc_id, stats))
      .filter((e): e is NonNullable<typeof e> => e !== null);
    let status = raw.status;
    let reasoning = raw.reasoning;
    if (status === "MET" && evidence.length === 0) {
      status = "UNCLEAR";
      reasoning = `${reasoning} (Downgraded: the cited evidence could not be verified in the chart.)`;
    }
    return {
      criterion_id: c.id,
      status,
      not_applicable: !raw.applicable && !!c.is_exception && status !== "MET",
      evidence,
      reasoning,
      decided_by: "ai",
    };
  });
  return { results, used: step.used, warning: step.warning };
}
