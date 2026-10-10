// Offline rules engine. A deterministic implementation of every pipeline step, used when no LLM is
// configured, or as the fallback when an LLM call fails. Criteria thresholds are read from the
// retrieved policy text, so the "same patient, different insurer" effect still comes from RAG.
// Quotes are always verbatim sentences from the chart, so they pass the evidence validator by construction.
import type { ChartDocument, Criterion, FactCategory, MatchResult, PolicyChunk } from "./types";
import type { DenialOut, GapOut, IntakeOut, PolicyCriteriaOut } from "./schemas";
import { firstSentence } from "./policyParser";

// ---------- sentence splitting ----------

export interface Sentence { text: string; doc_id: string; label: string | null }

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

export function splitSentences(doc: ChartDocument): Sentence[] {
  const out: Sentence[] = [];
  for (const line of doc.text.split(/\n+/)) {
    let label: string | null = null;
    let rest = line.trim();
    const lm = rest.match(/^([A-Z][A-Za-z ]{2,30}):\s+/);
    if (lm) { label = lm[1]; rest = rest.slice(lm[0].length); }
    for (const s of rest.split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
      const text = s.trim();
      if (text.length > 3) out.push({ text, doc_id: doc.doc_id, label });
    }
  }
  return out;
}

const negatedBefore = (sentence: string, keyword: RegExp) => {
  const m = sentence.match(keyword);
  if (!m || m.index === undefined) return false;
  return /\b(no|not|denies|denied|without|negative for|never)\b/i.test(sentence.slice(0, m.index));
};

const weeksIn = (s: string) => {
  const m = s.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+weeks?\b/i);
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
};

// ---------- intake ----------

const RX = {
  therapy: /\b(physiotherapy|physical therapy|exercises?|core strengthening)\b/i,
  imaging: /\b(x-ray|xray|radiograph)/i,
  redFlag: /\b(lock(s|ed|ing)?|fracture|infection|tumou?r|malignan\w*|cauda equina|progressive (neurological )?deficit)\b/i,
  functional: /\b(limits?|limiting|difficult\w*|unable|cannot|can't|wakes|interferes?|prevents?|persists on)\b/i,
  neuro: /\b(straight leg raise|reflex(es)?|radiat\w*|radicul\w*|numbness|dermatom\w*|weakness|sensory loss)\b/i,
};

function icdFor(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("radiculopathy")) return "M54.16";
  if (t.includes("back pain")) return "M54.50";
  if (t.includes("osteoarthritis") && t.includes("left")) return "M17.12";
  if (t.includes("osteoarthritis") && t.includes("right")) return "M17.11";
  if (t.includes("knee") && t.includes("left")) return "M25.562";
  if (t.includes("knee")) return "M25.561";
  return null;
}

export function rulesIntake(docs: ChartDocument[]): IntakeOut {
  const out: IntakeOut = {
    diagnoses: [], prior_treatments: [], imaging_history: [], red_flags: [], functional_limitations: [], neuro_findings: [],
  };
  for (const doc of docs) {
    for (const s of splitSentences(doc)) {
      const base = { quote: s.text, doc_id: s.doc_id };
      if (s.label === "Assessment") out.diagnoses.push({ text: s.text, icd10_candidate: icdFor(s.text), ...base });
      if (RX.therapy.test(s.text) && !negatedBefore(s.text, RX.therapy)) {
        const outcome = s.text.match(/\b(minimal relief|partial relief|no relief|no improvement[^.,;]*|without improvement)/i)?.[0] ?? null;
        out.prior_treatments.push({
          type: /home/i.test(s.text) ? "home exercise program" : "physiotherapy",
          duration_weeks: weeksIn(s.text),
          outcome,
          ...base,
        });
      }
      if (RX.imaging.test(s.text) && !negatedBefore(s.text, RX.imaging) && s.label !== "Plan") {
        out.imaging_history.push({ type: "X-ray", date: s.text.match(/\b\d{1,2} [A-Z][a-z]{2} \d{4}\b/)?.[0] ?? null, ...base });
      }
      if (RX.redFlag.test(s.text) && !negatedBefore(s.text, RX.redFlag)) out.red_flags.push({ text: s.text, ...base });
      if (RX.functional.test(s.text) && !negatedBefore(s.text, RX.functional)) out.functional_limitations.push({ text: s.text, ...base });
      if (RX.neuro.test(s.text) && !negatedBefore(s.text, RX.neuro)) out.neuro_findings.push({ text: s.text, ...base });
    }
  }
  return out;
}

// ---------- policy normalization ----------

export function rulesNormalizePolicy(chunks: PolicyChunk[]): PolicyCriteriaOut {
  const criteria = chunks
    .filter((c) => c.tag !== null)
    .sort((a, b) => Number(a.section) - Number(b.section))
    .map((c) => {
      const weeks = c.text.match(/at least (\d+) weeks/i);
      const waived = c.text.match(/waived when .*?section (\d+\.\d+)/i);
      return {
        section: c.section,
        title: c.title,
        text: firstSentence(c.text),
        required: c.tag === "required",
        min_weeks: weeks ? Number(weeks[1]) : null,
        waived_by_section: waived ? waived[1] : null,
        is_exception: /exception/i.test(c.title),
      };
    });
  return { criteria };
}

// ---------- criteria matching ----------

export type CriterionKind = "exception" | "therapy" | "imaging" | "neuro" | "functional" | "unknown";

export function criterionKind(c: Pick<Criterion, "title" | "text" | "is_exception">): CriterionKind {
  const t = `${c.title} ${c.text}`.toLowerCase();
  if (c.is_exception || /exception|red-flag|red flag/.test(c.title.toLowerCase())) return "exception";
  if (/conservative therapy|physiotherapy/.test(t)) return "therapy";
  if (/radiograph|x-ray|imaging/.test(t)) return "imaging";
  if (/neurolog|radicul/.test(t)) return "neuro";
  if (/function|daily activit/.test(t)) return "functional";
  return "unknown";
}

type FactLike = { category: FactCategory; quote: string; doc_id: string; duration_weeks?: number | null };

const ev = (f: FactLike) => ({ quote: f.quote, doc_id: f.doc_id });

export function rulesMatch(criteria: Criterion[], facts: FactLike[]): {
  criterion_id: string; status: MatchResult["status"]; applicable: boolean; evidence: { quote: string; doc_id: string }[]; reasoning: string;
}[] {
  const of = (cat: FactCategory) => facts.filter((f) => f.category === cat);
  const redFlags = of("red_flag");
  return criteria.map((c) => {
    const kind = criterionKind(c);
    const r = (status: MatchResult["status"], evidence: FactLike[], reasoning: string, applicable = true) => ({
      criterion_id: c.id, status, applicable, evidence: evidence.slice(0, 2).map(ev), reasoning,
    });
    switch (kind) {
      case "imaging": {
        const img = of("imaging");
        return img.length
          ? r("MET", img, "A plain radiograph (X-ray) of the affected joint is documented.")
          : r("MISSING", [], "No plain radiograph (X-ray) report or reference was found in the chart.");
      }
      case "therapy": {
        const waiver = criteria.find((x) => x.id === c.waived_by);
        if (waiver && redFlags.length) {
          return r("MET", redFlags, `Waived: a red-flag finding is documented, so the exception in ${waiver.policy_ref} applies.`);
        }
        const tx = of("prior_treatment");
        const withDur = tx.filter((t) => typeof t.duration_weeks === "number");
        const min = c.min_weeks ?? 0;
        const best = withDur.sort((a, b) => (b.duration_weeks ?? 0) - (a.duration_weeks ?? 0))[0];
        if (best && (best.duration_weeks ?? 0) >= min) {
          return r("MET", [best], `Documented ${best.duration_weeks} weeks of conservative therapy; policy requires ${min}.`);
        }
        if (best) return r("MISSING", [best], `Documented ${best.duration_weeks} weeks; policy requires ${min}.`);
        if (tx.length) return r("UNCLEAR", tx, "Therapy is mentioned, but its duration and outcome are not documented.");
        return r("MISSING", [], "No conservative therapy is documented in the chart.");
      }
      case "functional": {
        const f = of("functional_limitation");
        return f.length
          ? r("MET", f, "The chart documents symptoms that limit daily function.")
          : r("MISSING", [], "No functional limitation is documented.");
      }
      case "neuro": {
        const n = of("neuro_finding");
        return n.length
          ? r("MET", n, "Radicular symptoms or neurological findings are documented on examination.")
          : r("MISSING", [], "No radicular symptoms or neurological deficit are documented.");
      }
      case "exception":
        return redFlags.length
          ? r("MET", redFlags, "A red-flag finding is documented by the treating physician.")
          : r("MISSING", [], "No red-flag finding is documented; the standard pathway applies.", false);
      default:
        return r("UNCLEAR", [], "This criterion could not be evaluated automatically and needs human review.");
    }
  });
}

// ---------- gap questions ----------

export function rulesGaps(criteria: Criterion[], results: MatchResult[], facts: FactLike[], region: string): GapOut {
  const gaps: GapOut["gaps"] = [];
  for (const res of results) {
    const c = criteria.find((x) => x.id === res.criterion_id);
    if (!c || !c.required || res.not_applicable || res.status === "MET") continue;
    const kind = criterionKind(c);
    const weeks = facts
      .filter((f) => f.category === "prior_treatment" && typeof f.duration_weeks === "number")
      .map((f) => f.duration_weeks as number);
    const documented = weeks.length ? Math.max(...weeks) : null;
    let question: string;
    let target_role: "physician" | "coordinator" = "physician";
    if (kind === "therapy" && res.status === "MISSING" && documented !== null) {
      question = `PT documented is ${documented} weeks. Policy needs ${c.min_weeks}. Add the updated therapy record, or a clinical reason for proceeding earlier.`;
    } else if (kind === "therapy" && res.status === "UNCLEAR") {
      question = `The chart mentions exercises but not how long or with what result. Add the therapy duration and outcome (policy needs at least ${c.min_weeks} weeks).`;
    } else if (kind === "therapy") {
      question = "No conservative therapy is documented. Add the therapy records, or document a red-flag finding if one applies.";
    } else if (kind === "imaging") {
      question = `No ${region} X-ray report is in the chart. Attach the radiograph report, or confirm it has not been done.`;
      target_role = "coordinator";
    } else if (kind === "functional") {
      question = "Document how the symptoms limit daily function (for example walking, stairs, work, or sleep).";
    } else if (kind === "neuro") {
      question = "Document the neurological examination (straight leg raise, reflexes, sensation, power).";
    } else {
      question = `Provide evidence for: ${c.text}`;
    }
    gaps.push({ criterion_id: c.id, question, target_role });
  }
  return { gaps };
}

// ---------- denial classification ----------

export function rulesClassifyDenial(letter: string): DenialOut {
  const reasonLine =
    letter.split(/\n+/).find((l) => /^\s*reason/i.test(l))?.replace(/^\s*reason[^:]*:\s*/i, "").trim() ??
    letter.split(/\n+/).find((l) => /insufficient|not medically necessary|incorrect|invalid code/i.test(l))?.trim() ??
    "";
  const firstReason = firstSentence(reasonLine);
  const t = letter.toLowerCase();
  const reason_class: DenialOut["reason_class"] =
    /insufficient documentation|does not include documentation|missing documentation|not documented/.test(t)
      ? "missing_documentation"
      : /not medically necessary/.test(t)
        ? "not_medically_necessary"
        : /(incorrect|invalid|wrong) (cpt|icd|code)/.test(t)
          ? "wrong_code"
          : "other";
  const summary: Record<DenialOut["reason_class"], string> = {
    missing_documentation: "The insurer says required documentation was not included in the request.",
    not_medically_necessary: "The insurer says the service is not medically necessary.",
    wrong_code: "The insurer says a procedure or diagnosis code is wrong.",
    other: "The denial reason does not match a known category and needs manual review.",
  };
  return {
    reason_class,
    reason_summary: summary[reason_class],
    reason_quote: firstReason,
    policy_section: letter.match(/section (\d+\.\d+)/i)?.[1] ?? null,
  };
}
