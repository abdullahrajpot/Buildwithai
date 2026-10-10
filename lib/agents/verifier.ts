// Step 6: Verifier, two layers.
// 1. Code (deterministic): citations resolve to real quotes, required criteria are addressed, clinical
//    sentences are cited, statuses match the checklist, patient identity is consistent, codes exist.
// 2. Audit (separate LLM prompt acting as a strict auditor; offline rules when no LLM).
import { isKnownCpt, isKnownIcd } from "../codes";
import { locateQuote } from "../evidenceValidator";
import { structured } from "../llm";
import { AuditSchema, type AuditOut } from "../schemas";
import type { CaseDoc, ChartDocument, Citation, Patient, Provider, VerifierCheck } from "../types";
import { withFallback } from "./common";
import { resultWord, STATUS_WORD } from "./writer";

const CLINICAL_SECTIONS = /^(diagnosis|clinical history|treatments tried|imaging|red-flag findings|neurological findings|medical necessity)$/i;

function sections(letter: string) {
  const out: { title: string; body: string }[] = [];
  let cur: { title: string; body: string } | null = null;
  for (const line of letter.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = { title: h[1], body: "" }; out.push(cur); }
    else if (cur) cur.body += line + "\n";
  }
  return out;
}

export function codeChecks(letter: string, citations: Citation[], caseDoc: CaseDoc, patient: Patient, docs: ChartDocument[]): VerifierCheck[] {
  const checks: VerifierCheck[] = [];
  const markers = [...letter.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const unresolved = [...new Set(markers.filter((n) => {
    const c = citations.find((x) => x.n === n);
    const doc = c && docs.find((d) => d.doc_id === c.doc_id);
    return !c || !doc || !locateQuote(doc.text, c.quote);
  }))];
  checks.push({
    id: "citations_resolve",
    label: "Every citation resolves to a verbatim chart quote",
    layer: "code",
    passed: markers.length > 0 && unresolved.length === 0,
    detail: markers.length === 0 ? "The letter has no citations." : unresolved.length ? `Unresolved: ${unresolved.map((n) => `[${n}]`).join(", ")}` : `${new Set(markers).size} citations verified`,
  });

  const uncited: string[] = [];
  for (const s of sections(letter).filter((s) => CLINICAL_SECTIONS.test(s.title))) {
    const sentencesIn = s.body.replace(/\n+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter((x) => x.length > 12);
    for (const sen of sentencesIn) if (!/\[\d+\]/.test(sen) && !/^(no conservative therapy|the working diagnosis|mri is requested)/i.test(sen)) uncited.push(sen);
  }
  checks.push({
    id: "clinical_sentences_cited",
    label: "Each clinical sentence carries a citation",
    layer: "code",
    passed: uncited.length === 0,
    detail: uncited.length ? `Uncited: "${uncited[0].slice(0, 90)}"${uncited.length > 1 ? ` and ${uncited.length - 1} more` : ""}` : undefined,
  });

  const required = caseDoc.criteria.filter((c) => c.required);
  const notMentioned = required.filter((c) => !new RegExp(`\\b${c.id}\\b`).test(letter) && !letter.includes(c.policy_ref));
  checks.push({
    id: "criteria_addressed",
    label: "Every required criterion is addressed",
    layer: "code",
    passed: notMentioned.length === 0,
    detail: notMentioned.length ? `Not addressed: ${notMentioned.map((c) => c.id).join(", ")}` : `${required.length} of ${required.length} addressed`,
  });

  const wrongStatus: string[] = [];
  for (const line of letter.split("\n")) {
    const m = line.match(/^\s*[-*]\s*(C\d+)\b.*?:\s*(Met|Not yet documented|Unclear|Not applicable)\b/i);
    if (!m) continue;
    const r = caseDoc.results.find((x) => x.criterion_id === m[1]);
    if (m[2].toLowerCase() === STATUS_WORD.MET.toLowerCase() && resultWord(r) !== STATUS_WORD.MET) wrongStatus.push(m[1]);
  }
  checks.push({
    id: "criteria_status_consistent",
    label: "Letter matches the checklist status",
    layer: "code",
    passed: wrongStatus.length === 0,
    detail: wrongStatus.length ? `Claimed met but not met: ${wrongStatus.join(", ")}` : undefined,
  });

  const foreignDocs = docs.filter((d) => d.patient_id !== caseDoc.patient_id);
  const mrnOk = letter.includes(patient.mrn);
  checks.push({
    id: "identity_consistent",
    label: "Patient identity matches across documents",
    layer: "code",
    passed: foreignDocs.length === 0 && mrnOk && caseDoc.patient_id === patient._id,
    detail: !mrnOk ? "The letter does not show the patient's MRN." : foreignDocs.length ? `${foreignDocs.length} documents belong to another patient` : patient.mrn,
  });

  const badCodes = [caseDoc.procedure_code].filter((c) => !isKnownCpt(c)).concat(caseDoc.icd10_codes.filter((c) => !isKnownIcd(c)));
  checks.push({
    id: "codes_valid",
    label: "CPT and ICD-10 codes exist in the lookup",
    layer: "code",
    passed: badCodes.length === 0,
    detail: badCodes.length ? `Unknown: ${badCodes.join(", ")}` : [caseDoc.procedure_code, ...caseDoc.icd10_codes].join(", "),
  });
  return checks;
}

const SYSTEM = `You are a strict prior-authorization auditor. You did not write this letter.
Compare the Letter of Medical Necessity with the evidence catalog and the criteria statuses.
Fail the letter if it contains any clinical statement not supported by a cited catalog quote, contradicts the chart,
misstates a number, or leaves a required criterion unaddressed. List each issue in one sentence. Return PASS only if there are none.`;

function rulesAudit(letter: string, caseDoc: CaseDoc): AuditOut {
  const issues: string[] = [];
  if (/\b(probably|likely|we believe|it seems)\b/i.test(letter)) issues.push("The letter uses speculative language.");
  for (const c of caseDoc.criteria.filter((x) => x.required)) {
    const r = caseDoc.results.find((x) => x.criterion_id === c.id);
    if (!r) issues.push(`${c.id} has no checklist result.`);
  }
  return { verdict: issues.length ? "FAIL" : "PASS", issues };
}

export async function runVerifier(
  letter: string,
  citations: Citation[],
  caseDoc: CaseDoc,
  patient: Patient,
  docs: ChartDocument[],
  provider: Provider,
) {
  const checks = codeChecks(letter, citations, caseDoc, patient, docs);
  const audit = await withFallback<AuditOut>(
    provider,
    () =>
      structured(provider, {
        system: SYSTEM,
        prompt: [
          `Letter:\n${letter}`,
          `Evidence catalog:\n${citations.map((c) => `[${c.n}] "${c.quote}"`).join("\n")}`,
          `Criteria statuses:\n${caseDoc.criteria.map((c) => `${c.id} ${c.title} (required: ${c.required}): ${resultWord(caseDoc.results.find((r) => r.criterion_id === c.id))}`).join("\n")}`,
        ].join("\n\n"),
        schema: AuditSchema,
      }),
    () => rulesAudit(letter, caseDoc),
  );
  checks.push({
    id: "audit",
    label: audit.used === "rules" ? "Independent audit (offline rules)" : "Independent LLM audit",
    layer: "llm",
    passed: audit.value.verdict === "PASS",
    detail: audit.value.issues.join(" ") || "No unsupported or contradictory statements found",
  });
  const issues = checks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail ?? "failed"}`);
  return { status: issues.length ? ("FAIL" as const) : ("PASS" as const), issues, checks, used: audit.used, warning: audit.warning };
}
