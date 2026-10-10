// Step 1: Intake. Extracts structured facts from the chart, each with a verbatim quote.
// The model returns quote + doc_id only; code locates the quote and stores char offsets.
// Facts whose quote is not found are dropped and counted (evidence grounding rate).
import { structured } from "../llm";
import { rulesIntake } from "../rules";
import { IntakeSchema, type IntakeOut } from "../schemas";
import { validateEvidence, type ValidationStats } from "../evidenceValidator";
import type { ChartDocument, Fact, Provider } from "../types";
import { chartForPrompt, QUOTE_RULES, withFallback } from "./common";

const SYSTEM = `You are the intake agent of a prior-authorization assistant used by hospital staff.
Read the patient's chart and extract only facts that are explicitly written in it:
diagnoses (with a candidate ICD-10-CM code if obvious), prior treatments (type, duration in weeks only if stated, outcome),
imaging history, red-flag findings (for example mechanical locking, suspected fracture, infection, tumor, cauda equina),
functional limitations, and neurological findings.
Ignore negated findings (for example "No locking" is not a red flag). Do not infer durations that are not written.
${QUOTE_RULES}`;

export async function runIntake(docs: ChartDocument[], provider: Provider, stats: ValidationStats, idPrefix = "F") {
  const step = await withFallback<IntakeOut>(
    provider,
    () => structured(provider, { system: SYSTEM, prompt: `Patient chart:\n\n${chartForPrompt(docs)}`, schema: IntakeSchema }),
    () => rulesIntake(docs),
  );
  const out = step.value;
  const facts: Fact[] = [];
  let n = 0;
  const add = (category: Fact["category"], item: { quote: string; doc_id: string }, text: string, extra: Partial<Fact> = {}) => {
    const evd = validateEvidence(docs, item.quote, item.doc_id, stats);
    if (!evd) return; // quote not in chart -> fact rejected
    facts.push({ id: `${idPrefix}${++n}`, category, text, ...evd, ...extra });
  };
  out.diagnoses.forEach((d) => add("diagnosis", d, d.text, { icd10_candidate: d.icd10_candidate }));
  out.prior_treatments.forEach((t) =>
    add("prior_treatment", t, describeTreatment(t), { duration_weeks: t.duration_weeks, outcome: t.outcome }),
  );
  out.imaging_history.forEach((i) => add("imaging", i, `${i.type}${i.date ? ` on ${i.date}` : ""}`, { date: i.date }));
  out.red_flags.forEach((r) => add("red_flag", r, r.text));
  out.functional_limitations.forEach((f) => add("functional_limitation", f, f.text));
  out.neuro_findings.forEach((f) => add("neuro_finding", f, f.text));
  return { facts, used: step.used, warning: step.warning };
}

function describeTreatment(t: IntakeOut["prior_treatments"][number]) {
  const dur = t.duration_weeks != null ? `${t.duration_weeks} weeks of ${t.type}` : `${t.type} (duration not stated)`;
  return t.outcome ? `${dur}, ${t.outcome}` : dur;
}
