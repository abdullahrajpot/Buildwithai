// Step 9 (mock): Appeal. Classifies the denial reason, searches the chart for counter-evidence by
// reusing the matcher, and drafts a cited appeal letter. A human reviews it before "sending".
import { appendAudit } from "../audit";
import { CPT } from "../codes";
import { getStore } from "../db";
import { locateQuote, newStats } from "../evidenceValidator";
import { configuredProvider, providerLabel, structured } from "../llm";
import { getCase, getChart, getInsurer, getPatient, now, updateCase } from "../repo";
import { criterionKind, rulesClassifyDenial } from "../rules";
import { DenialSchema, LetterSchema, type DenialOut } from "../schemas";
import type { Appeal, Citation, CounterEvidence } from "../types";
import { withFallback } from "./common";
import { runMatcher } from "./matcher";

const CLASSIFY_SYSTEM = `You classify insurance pre-authorization denial letters.
Return the reason class (missing_documentation, not_medically_necessary, wrong_code, other), a one-sentence plain summary,
the sentence that states the reason copied verbatim from the letter, and the policy section number if one is cited.`;

const APPEAL_SYSTEM = `You write concise, professional appeal letters for denied pre-authorization requests.
Sections as "## " headings: Reason for appeal, Supporting evidence, Request.
Every clinical statement must end with a citation marker like [2] using ONLY numbers from the evidence catalog.
Do not invent facts. Quote the insurer's stated reason. Start with the bold header lines provided, end with "Sincerely," and the provider's name.`;

export async function draftAppeal(caseId: string, denialText: string, actor: string) {
  const provider = configuredProvider();
  const c = await getCase(caseId);
  if (!c) throw new Error(`Case ${caseId} not found`);
  const [patient, docs, insurer] = await Promise.all([getPatient(c.patient_id), getChart(c.patient_id), getInsurer(c.insurer)]);
  if (!patient || !insurer) throw new Error("Missing patient or insurer");

  const cls = await withFallback<DenialOut>(
    provider,
    () => structured(provider, { system: CLASSIFY_SYSTEM, prompt: denialText, schema: DenialSchema }),
    () => rulesClassifyDenial(denialText),
  );
  const span = cls.value.reason_quote ? locateQuote(denialText, cls.value.reason_quote) : null;

  // Which criterion is the denial about? Cited section first, then the reason class.
  const target =
    c.criteria.find((x) => x.section === cls.value.policy_section) ??
    (cls.value.reason_class === "missing_documentation" ? c.criteria.find((x) => criterionKind(x) === "therapy") : undefined) ??
    null;

  const stats = newStats();
  const context = target ? c.criteria.filter((x) => x.id === target.id || x.id === target.waived_by) : c.criteria;
  const match = await runMatcher(context, c.facts, docs, provider, stats);
  const relevant = target ? match.results.filter((r) => r.criterion_id === target.id) : match.results.filter((r) => r.status === "MET");
  const counter: CounterEvidence[] = relevant.flatMap((r) =>
    r.evidence.map((e) => ({ ...e, criterion_id: r.criterion_id, doc_title: docs.find((d) => d.doc_id === e.doc_id)?.title ?? e.doc_id })),
  );
  const citations: Citation[] = counter.map((e, i) => ({ n: i + 1, doc_id: e.doc_id, doc_title: e.doc_title, quote: e.quote, char_start: e.char_start, char_end: e.char_end }));

  const ref = denialText.match(/Reference:\s*(\S+)/i)?.[1] ?? "the recent decision";
  const header = [
    `**Re: Appeal of pre-authorization decision ${ref}**`,
    `**Patient:** ${patient.name_masked}, ${patient.age} ${patient.sex}, ${patient.mrn}  `,
    `**Service:** ${CPT[c.procedure_code]?.name ?? c.procedure_code} without contrast (CPT ${c.procedure_code}), ${insurer.name} (${insurer.subtitle})`,
  ].join("\n");

  const template = () => {
    const lines = [header, "", "To the appeals reviewer,", "", "## Reason for appeal"];
    lines.push(
      `The request was not approved for the following reason: "${cls.value.reason_quote || cls.value.reason_summary}" ` +
        (citations.length
          ? `The patient's chart contains the documentation required${target ? ` by ${target.policy_ref}` : ""}, and we ask you to reconsider.`
          : "We have reviewed the chart and request a peer-to-peer discussion."),
    );
    lines.push("", "## Supporting evidence");
    if (citations.length) for (const ct of citations) lines.push(`- ${ct.doc_title}: ${ct.quote.replace(/[.\s]+$/, "")} [${ct.n}].`);
    else lines.push("- No counter-evidence was found in the chart. Additional documentation is needed before appealing.");
    lines.push("", "## Request");
    lines.push("Please reverse the decision and approve the requested imaging. The supporting clinical notes are attached to this appeal.");
    lines.push("", "Sincerely,", "", patient.provider.name, patient.provider.facility);
    return lines.join("\n");
  };

  const letter = await withFallback<string>(
    provider,
    async () =>
      (
        await structured(provider, {
          system: APPEAL_SYSTEM,
          prompt: [
            `Header lines:\n${header}`,
            `Provider: ${patient.provider.name}, ${patient.provider.facility}`,
            `Denial letter:\n${denialText}`,
            `Evidence catalog (verified chart quotes):\n${citations.map((ct) => `[${ct.n}] (${ct.doc_title}) "${ct.quote}"`).join("\n") || "(none found)"}`,
          ].join("\n\n"),
          schema: LetterSchema,
        })
      ).letter_md,
    template,
  );

  const appeal: Appeal = {
    _id: caseId,
    case_id: caseId,
    denial_text: denialText,
    reason_class: cls.value.reason_class,
    reason_summary: cls.value.reason_summary,
    denial_reason_span: span,
    target_criterion_id: target?.id ?? null,
    counter_evidence: counter,
    letter_md: letter.value,
    citations,
    status: "draft",
    provider_used: letter.used,
    created_at: now(),
    updated_at: now(),
  };
  await getStore().replaceOne("appeals", appeal);
  await updateCase(caseId, { status: "APPEAL_DRAFTED" });
  await appendAudit({
    case_id: caseId, actor_type: "ai", actor: providerLabel(letter.used), action: "APPEAL_DRAFTED",
    payload: { reason_class: appeal.reason_class, target: appeal.target_criterion_id, counter_evidence: counter.length, requested_by: actor },
  });
  return appeal;
}
