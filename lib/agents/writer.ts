// Step 5: Packet writer. Drafts the Letter of Medical Necessity from a fixed structure:
// patient summary -> diagnosis -> history -> treatments tried -> why necessary -> criteria addressed.
// The writer only sees a numbered catalog of already-verified quotes, and each clinical sentence must
// end with [n] pointing into that catalog, so it cannot cite evidence that is not in the chart.
import { CPT, ICD10 } from "../codes";
import { structured } from "../llm";
import { LetterSchema } from "../schemas";
import type { CaseDoc, ChartDocument, Citation, Criterion, Fact, FormJson, Insurer, MatchResult, Patient, Policy, Provider } from "../types";
import { withFallback } from "./common";

export interface WriterInput {
  caseDoc: CaseDoc;
  patient: Patient;
  docs: ChartDocument[];
  insurer: Insurer;
  policy: Policy;
  issues?: string[]; // verifier issues from a failed attempt
}

export const STATUS_WORD = { MET: "Met", MISSING: "Not yet documented", UNCLEAR: "Unclear", NA: "Not applicable" } as const;

export function resultWord(r: MatchResult | undefined) {
  if (!r) return STATUS_WORD.UNCLEAR;
  if (r.not_applicable) return STATUS_WORD.NA;
  return STATUS_WORD[r.status];
}

/** Numbered catalog of verified quotes: facts first (in letter order), then any extra match evidence. */
export function buildCatalog(facts: Fact[], results: MatchResult[], docs: ChartDocument[]) {
  const citations: Citation[] = [];
  const key = (doc_id: string, start: number) => `${doc_id}:${start}`;
  const index = new Map<string, number>();
  const add = (e: { doc_id: string; quote: string; char_start: number; char_end: number }) => {
    const k = key(e.doc_id, e.char_start);
    if (index.has(k)) return index.get(k)!;
    const n = citations.length + 1;
    citations.push({ n, doc_id: e.doc_id, doc_title: docs.find((d) => d.doc_id === e.doc_id)?.title ?? e.doc_id, quote: e.quote, char_start: e.char_start, char_end: e.char_end });
    index.set(k, n);
    return n;
  };
  const order: Fact["category"][] = ["diagnosis", "functional_limitation", "prior_treatment", "imaging", "neuro_finding", "red_flag"];
  for (const cat of order) facts.filter((f) => f.category === cat).forEach(add);
  results.forEach((r) => r.evidence.forEach(add));
  const cite = (e: { doc_id: string; char_start: number }) => index.get(key(e.doc_id, e.char_start));
  return { citations, cite };
}

export function buildForm(input: WriterInput): FormJson {
  const { caseDoc, patient, insurer, policy } = input;
  return {
    patient_name_masked: patient.name_masked,
    mrn: patient.mrn,
    age_sex: `${patient.age} ${patient.sex}`,
    insurer: `${insurer.name} (${insurer.subtitle})`,
    policy_id: `${policy._id} v${policy.version}`,
    cpt_code: caseDoc.procedure_code,
    cpt_description: CPT[caseDoc.procedure_code]?.description ?? "Unknown procedure",
    icd10_codes: caseDoc.icd10_codes.map((code) => ({ code, description: ICD10[code] ?? "Not in demo lookup" })),
    provider_name: patient.provider.name,
    provider_id: patient.provider.id,
    facility: patient.provider.facility,
    request_date: new Date().toISOString().slice(0, 10),
  };
}

const sentence = (text: string, n: number | undefined) => `${text.replace(/[.\s]+$/, "")}${n ? ` [${n}]` : ""}.`;

function templateLetter(input: WriterInput, citations: ReturnType<typeof buildCatalog>) {
  const { caseDoc, patient, insurer, policy } = input;
  const { cite } = citations;
  const facts = caseDoc.facts;
  const of = (c: Fact["category"]) => facts.filter((f) => f.category === c);
  const proc = CPT[caseDoc.procedure_code];
  const lines: string[] = [];
  lines.push(`**Re: Pre-authorization request for ${proc?.name ?? caseDoc.procedure_code} without contrast (CPT ${caseDoc.procedure_code})**`);
  lines.push(`**Patient:** ${patient.name_masked}, ${patient.age} ${patient.sex}, ${patient.mrn}  `);
  lines.push(`**Insurer:** ${insurer.name} (${insurer.subtitle}), policy ${policy._id}`);
  lines.push("", "To the reviewing medical officer,", "");
  lines.push("## Patient summary");
  lines.push(
    `We request pre-authorization of ${proc?.name ?? "the requested imaging"} for ${patient.name_masked}, a ${patient.age}-year-old ${patient.sex === "F" ? "woman" : "man"} under the care of ${patient.provider.name}. ` +
      `The request is assessed against ${policy.name}.`,
  );
  lines.push("", "## Diagnosis");
  const dx = of("diagnosis");
  lines.push(dx.length ? dx.map((f) => sentence(`Clinical assessment: ${f.text}`, cite(f))).join(" ") : "The working diagnosis is recorded in the attached clinical notes.");
  const fn = of("functional_limitation").slice(0, 2);
  const neuro = of("neuro_finding").slice(0, 3);
  if (fn.length || neuro.length) {
    lines.push("", "## Clinical history");
    lines.push([...fn, ...neuro].map((f) => sentence(f.text, cite(f))).join(" "));
  }
  const tx = of("prior_treatment").sort((a, b) => (b.duration_weeks ?? -1) - (a.duration_weeks ?? -1)).slice(0, 3);
  const img = of("imaging").slice(0, 1);
  const flags = of("red_flag").slice(0, 2);
  lines.push("", "## Treatments tried");
  lines.push(tx.length ? tx.map((f) => sentence(`Prior treatment: ${f.text}`, cite(f))).join(" ") : "No conservative therapy is documented in the chart at this time.");
  if (img.length) {
    lines.push("", "## Imaging");
    lines.push(img.map((f) => sentence(`Prior imaging: ${f.quote}`, cite(f))).join(" "));
  }
  if (flags.length) {
    lines.push("", "## Red-flag findings");
    lines.push(flags.map((f) => sentence(f.text, cite(f))).join(" "));
  }
  lines.push("", "## Medical necessity");
  const basis = flags[0] ?? tx[0] ?? fn[0] ?? dx[0];
  lines.push(
    basis
      ? sentence(
          flags[0]
            ? "A documented red-flag finding makes early MRI necessary to guide management"
            : "Symptoms persist despite the conservative management documented above, and MRI is needed to confirm the diagnosis and plan definitive treatment",
          cite(basis),
        )
      : "MRI is requested to confirm the diagnosis and plan treatment.",
  );
  lines.push("", "## Criteria addressed");
  for (const c of caseDoc.criteria) {
    const r = caseDoc.results.find((x) => x.criterion_id === c.id);
    const refs = (r?.status === "MET" ? r.evidence : []).map((e) => cite(e)).filter(Boolean).map((n) => `[${n}]`).join(" ");
    lines.push(`- ${c.id} (${c.policy_ref}) ${c.title}: ${resultWord(r)}${refs ? ` ${refs}` : ""}`);
  }
  lines.push("", "Sincerely,", "", patient.provider.name, patient.provider.facility);
  return lines.join("\n");
}

const SYSTEM = `You are the packet-writing agent of a prior-authorization assistant.
Write a concise Letter of Medical Necessity in Markdown with these sections, in order, as "## " headings:
Patient summary, Diagnosis, Clinical history, Treatments tried, Imaging (if any), Red-flag findings (if any), Medical necessity, Criteria addressed.
Rules:
- Every clinical sentence must end with one or more citation markers like [3], using ONLY numbers from the evidence catalog.
- Do not state any clinical fact that is not in the catalog. Do not invent dates, durations, or findings.
- "Criteria addressed" is a bullet list with one line per criterion, formatted exactly as:
  "- <id> (<policy_ref>) <title>: <Met | Not yet documented | Unclear | Not applicable> [n]"
  using the status given for each criterion. Never call a criterion Met unless its status is MET.
- Start with the bold Re:, Patient:, and Insurer: lines provided. End with "Sincerely," and the provider's name and facility.`;

export async function runWriter(input: WriterInput, provider: Provider) {
  const { caseDoc, patient, insurer, policy, docs } = input;
  const catalog = buildCatalog(caseDoc.facts, caseDoc.results, docs);
  const step = await withFallback<string>(
    provider,
    async () =>
      (
        await structured(provider, {
          system: SYSTEM,
          prompt: [
            `Header lines:\n**Re: Pre-authorization request for ${CPT[caseDoc.procedure_code]?.name} without contrast (CPT ${caseDoc.procedure_code})**\n**Patient:** ${patient.name_masked}, ${patient.age} ${patient.sex}, ${patient.mrn}\n**Insurer:** ${insurer.name} (${insurer.subtitle}), policy ${policy._id}`,
            `Provider: ${patient.provider.name}, ${patient.provider.facility}`,
            `Evidence catalog (verified verbatim chart quotes):\n${catalog.citations.map((c) => `[${c.n}] (${c.doc_title}) "${c.quote}"`).join("\n")}`,
            `Criteria and statuses:\n${caseDoc.criteria
              .map((c) => {
                const r = caseDoc.results.find((x) => x.criterion_id === c.id);
                const refs = (r?.evidence ?? []).map((e) => catalog.cite(e)).filter(Boolean).join(", ");
                return `${c.id} (${c.policy_ref}) ${c.title}: ${r?.not_applicable ? "NOT_APPLICABLE" : r?.status ?? "UNCLEAR"}${refs ? ` evidence [${refs}]` : ""}`;
              })
              .join("\n")}`,
            input.issues?.length ? `A previous draft failed verification. Fix these issues:\n- ${input.issues.join("\n- ")}` : "",
          ].filter(Boolean).join("\n\n"),
          schema: LetterSchema,
        })
      ).letter_md,
    () => templateLetter(input, catalog),
  );
  return { letter_md: step.value, citations: catalog.citations, form_json: buildForm(input), used: step.used, warning: step.warning };
}
