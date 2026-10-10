// Zod schemas for every LLM step. No free text passes between pipeline steps.
// Agents return quotes and doc ids only; code computes character offsets (lib/evidenceValidator.ts).
import { z } from "zod";

const quoted = { quote: z.string(), doc_id: z.string() };

export const IntakeSchema = z.object({
  diagnoses: z.array(z.object({ text: z.string(), icd10_candidate: z.string().nullable(), ...quoted })),
  prior_treatments: z.array(
    z.object({ type: z.string(), duration_weeks: z.number().nullable(), outcome: z.string().nullable(), ...quoted }),
  ),
  imaging_history: z.array(z.object({ type: z.string(), date: z.string().nullable(), ...quoted })),
  red_flags: z.array(z.object({ text: z.string(), ...quoted })),
  functional_limitations: z.array(z.object({ text: z.string(), ...quoted })),
  neuro_findings: z.array(z.object({ text: z.string(), ...quoted })),
});
export type IntakeOut = z.infer<typeof IntakeSchema>;

export const PolicyCriteriaSchema = z.object({
  criteria: z.array(
    z.object({
      section: z.string(),
      title: z.string(),
      text: z.string(),
      required: z.boolean(),
      min_weeks: z.number().nullable(),
      waived_by_section: z.string().nullable(),
      is_exception: z.boolean(),
    }),
  ),
});
export type PolicyCriteriaOut = z.infer<typeof PolicyCriteriaSchema>;

export const MatchSchema = z.object({
  results: z.array(
    z.object({
      criterion_id: z.string(),
      status: z.enum(["MET", "MISSING", "UNCLEAR"]),
      applicable: z.boolean(),
      evidence: z.array(z.object(quoted)),
      reasoning: z.string(),
    }),
  ),
});
export type MatchOut = z.infer<typeof MatchSchema>;

export const GapSchema = z.object({
  gaps: z.array(
    z.object({ criterion_id: z.string(), question: z.string(), target_role: z.enum(["physician", "coordinator"]) }),
  ),
});
export type GapOut = z.infer<typeof GapSchema>;

export const LetterSchema = z.object({ letter_md: z.string() });

export const AuditSchema = z.object({
  verdict: z.enum(["PASS", "FAIL"]),
  issues: z.array(z.string()),
});
export type AuditOut = z.infer<typeof AuditSchema>;

export const DenialSchema = z.object({
  reason_class: z.enum(["missing_documentation", "not_medically_necessary", "wrong_code", "other"]),
  reason_summary: z.string(),
  reason_quote: z.string(),
  policy_section: z.string().nullable(),
});
export type DenialOut = z.infer<typeof DenialSchema>;
