// Data access helpers shared by API routes, the pipeline and scripts.
import { getStore } from "./db";
import type {
  Appeal, AuditEntry, CaseDoc, ChartDocument, Insurer, Packet, Patient, Policy, Submission,
} from "./types";

export const now = () => new Date().toISOString();

export async function getCase(id: string) {
  return getStore().findOne<CaseDoc>("cases", { _id: id });
}

export async function updateCase(id: string, patch: Partial<CaseDoc>) {
  await getStore().updateOne("cases", id, { ...patch, updated_at: now() });
}

export async function getPatient(id: string) {
  return getStore().findOne<Patient>("patients", { _id: id });
}

/** Documents currently in the patient's chart (excludes demo documents waiting to be attached). */
export async function getChart(patientId: string) {
  const docs = await getStore().find<ChartDocument>("documents", { patient_id: patientId }, { sort: { date: 1 } });
  return docs.filter((d) => !d.attachable);
}

export async function getAttachable(patientId: string) {
  const docs = await getStore().find<ChartDocument>("documents", { patient_id: patientId });
  return docs.filter((d) => d.attachable);
}

export async function getInsurer(id: string) {
  return getStore().findOne<Insurer>("insurers", { _id: id });
}

export async function getPolicyFor(insurer: string, procedure: string) {
  const policies = await getStore().find<Policy>("policies", { insurer });
  return policies.find((p) => p.procedure_codes.includes(procedure)) ?? null;
}

export async function getPacket(caseId: string) {
  return getStore().findOne<Packet>("packets", { _id: caseId });
}

export async function getSubmission(caseId: string) {
  return getStore().findOne<Submission>("submissions", { _id: caseId });
}

export async function getAppeal(caseId: string) {
  return getStore().findOne<Appeal>("appeals", { _id: caseId });
}

export async function nextCaseId() {
  const cases = await getStore().find<CaseDoc>("cases");
  const max = cases.reduce((m, c) => Math.max(m, Number(c._id.replace(/\D/g, "")) || 0), 1000);
  return `PA-${max + 1}`;
}

export function newCase(id: string, p: { patient_id: string; procedure_code: string; insurer: string; icd10_codes: string[] }): CaseDoc {
  const t = now();
  return {
    _id: id,
    ...p,
    policy_id: null,
    status: "DRAFT",
    facts: [],
    criteria: [],
    results: [],
    gaps: [],
    events: [],
    readiness: null,
    provider_used: null,
    grounding: { verified: 0, returned: 0 },
    run_count: 0,
    error: null,
    from_cache: false,
    created_at: t,
    updated_at: t,
  };
}

export async function auditFor(caseId: string) {
  return getStore().find<AuditEntry>("audit_log", { case_id: caseId }, { sort: { created_at: -1 } });
}
