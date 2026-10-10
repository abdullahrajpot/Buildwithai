// Shared domain types. Mirrors the MongoDB collections in the MVP spec, section 10.

export type CriterionStatus = "MET" | "MISSING" | "UNCLEAR";

export type CaseStatus =
  | "DRAFT"
  | "RUNNING"
  | "NEEDS_INFO"
  | "READY_FOR_REVIEW"
  | "APPROVED_BY_HUMAN"
  | "SUBMITTED"
  | "PAYER_APPROVED"
  | "DENIED"
  | "APPEAL_DRAFTED"
  | "REJECTED_BY_REVIEWER";

export type Role = "coordinator" | "physician" | "manager";
export type ActorType = "ai" | "human" | "system";
export type Provider = "claude" | "groq" | "ollama" | "rules";

export interface ProviderInfo {
  name: string;
  id: string;
  facility: string;
}

export interface Patient {
  _id: string;
  label: string;
  mrn: string;
  name_masked: string;
  initials: string;
  age: number;
  sex: "F" | "M";
  default_insurer: string;
  procedure_code: string;
  icd10_codes: string[];
  provider: ProviderInfo;
}

export type DocType = "visit_note" | "pt_note" | "imaging_report" | "addendum" | "upload";

export interface ChartDocument {
  _id: string;
  patient_id: string;
  doc_id: string;
  type: DocType;
  title: string;
  date: string;
  author: string;
  text: string;
  created_at: string;
  attachable?: boolean; // sample documents that are not yet in the chart (demo "Attach" flow)
}

export interface Insurer {
  _id: string;
  name: string;
  subtitle: string;
  monogram: string;
}

export interface Policy {
  _id: string;
  insurer: string;
  name: string;
  short: string;
  procedure_codes: string[];
  version: string;
  source_file: string;
}

export interface PolicyChunk {
  _id: string;
  policy_id: string;
  insurer: string;
  procedure_code: string; // CPT code or "ALL"
  section: string; // "2.2"
  title: string;
  tag: "required" | "optional" | null; // null for non-criteria sections
  meta: Record<string, string>;
  text: string;
  embedding: number[] | null;
}

export type FactCategory =
  | "diagnosis"
  | "prior_treatment"
  | "imaging"
  | "red_flag"
  | "functional_limitation"
  | "neuro_finding";

export interface Fact {
  id: string;
  category: FactCategory;
  text: string;
  quote: string;
  doc_id: string;
  char_start: number;
  char_end: number;
  duration_weeks?: number | null;
  outcome?: string | null;
  date?: string | null;
  icd10_candidate?: string | null;
}

export interface Criterion {
  id: string; // C1..Cn
  title: string;
  text: string;
  required: boolean;
  policy_ref: string; // "PolicyA §2.2"
  section: string;
  min_weeks?: number | null;
  waived_by?: string | null; // criterion id of the red-flag exception
  is_exception?: boolean;
}

export interface Evidence {
  quote: string;
  doc_id: string;
  char_start: number;
  char_end: number;
}

export interface MatchResult {
  criterion_id: string;
  status: CriterionStatus;
  not_applicable: boolean;
  evidence: Evidence[];
  reasoning: string;
  decided_by: "ai" | "human";
}

export type GapAction = "attach" | "note" | "not_applicable" | "confirm_not_done";

export interface Gap {
  id: string;
  criterion_id: string;
  question: string;
  target_role: Role;
  status: "open" | "resolved" | "not_applicable" | "confirmed_missing";
  resolution?: string;
  resolved_by?: string;
  resolved_at?: string;
}

export type StepKey = "intake" | "policy" | "matcher" | "gaps" | "writer" | "verifier" | "readiness";
export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface PipelineEvent {
  step: StepKey;
  label: string;
  status: StepStatus;
  summary?: string;
  warning?: string;
  provider?: Provider;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
}

export interface Readiness {
  score: number;
  capped: boolean;
  met_weight: number;
  total_weight: number;
  fixes: string[];
}

export interface CaseDoc {
  _id: string;
  patient_id: string;
  procedure_code: string;
  icd10_codes: string[];
  insurer: string;
  policy_id: string | null;
  status: CaseStatus;
  facts: Fact[];
  criteria: Criterion[];
  results: MatchResult[];
  gaps: Gap[];
  events: PipelineEvent[];
  readiness: Readiness | null;
  provider_used: Provider | null;
  grounding: { verified: number; returned: number };
  run_count: number;
  error: string | null;
  from_cache: boolean;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  n: number;
  doc_id: string;
  doc_title: string;
  quote: string;
  char_start: number;
  char_end: number;
}

export interface VerifierCheck {
  id: string;
  label: string;
  layer: "code" | "llm";
  passed: boolean;
  detail?: string;
}

export interface FormJson {
  patient_name_masked: string;
  mrn: string;
  age_sex: string;
  insurer: string;
  policy_id: string;
  cpt_code: string;
  cpt_description: string;
  icd10_codes: { code: string; description: string }[];
  provider_name: string;
  provider_id: string;
  facility: string;
  request_date: string;
}

export interface Packet {
  _id: string; // same as case id
  case_id: string;
  letter_md: string;
  form_json: FormJson;
  citations: Citation[];
  verifier_status: "PASS" | "FAIL";
  verifier_issues: string[];
  checks: VerifierCheck[];
  version: number;
  writer_attempts: number;
  edited_by_human: boolean;
  updated_at: string;
}

export interface Submission {
  _id: string;
  case_id: string;
  approved_by: string;
  approved_at: string;
  mock_reference: string | null;
  submitted_at: string | null;
  outcome: "pending" | "approved" | "denied";
  outcome_reason: string | null;
}

export type DenialReasonClass = "missing_documentation" | "not_medically_necessary" | "wrong_code" | "other";

export interface CounterEvidence extends Evidence {
  criterion_id: string;
  doc_title: string;
}

export interface Appeal {
  _id: string; // same as case id
  case_id: string;
  denial_text: string;
  reason_class: DenialReasonClass;
  reason_summary: string;
  denial_reason_span: { start: number; end: number } | null;
  target_criterion_id: string | null;
  counter_evidence: CounterEvidence[];
  letter_md: string;
  citations: Citation[];
  status: "draft" | "approved_to_send" | "sent";
  provider_used: Provider;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  _id: string;
  case_id: string | null;
  actor_type: ActorType;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface RunCacheEntry {
  _id: string; // `${patient}|${procedure}|${insurer}|${docsHash}`
  snapshot: Pick<CaseDoc, "facts" | "criteria" | "results" | "gaps" | "events" | "readiness" | "provider_used" | "grounding" | "policy_id" | "status">;
  packet: Omit<Packet, "_id" | "case_id"> | null;
  created_at: string;
}
