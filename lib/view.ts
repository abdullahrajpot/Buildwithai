// Read models assembled for the UI (one request per screen).
import fs from "node:fs";
import path from "node:path";
import { procedureName, CPT } from "./codes";
import { getStore } from "./db";
import { configuredProvider, providerLabel } from "./llm";
import { auditFor, getAppeal, getAttachable, getCase, getChart, getInsurer, getPacket, getPatient, getSubmission } from "./repo";
import { hasCache } from "./agents/pipeline";
import type { CaseDoc, Insurer, Packet, Patient, Policy } from "./types";

export const CLOSED: CaseDoc["status"][] = ["SUBMITTED", "PAYER_APPROVED", "REJECTED_BY_REVIEWER"];

export function providerInfo() {
  const p = configuredProvider();
  return { configured: p, label: providerLabel(p), store: getStore().kind };
}

export async function caseView(id: string) {
  const c = await getCase(id);
  if (!c) return null;
  const store = getStore();
  const [patient, insurer, docs, attachable, packet, submission, appeal, audit, policies, siblings] = await Promise.all([
    getPatient(c.patient_id),
    getInsurer(c.insurer),
    getChart(c.patient_id),
    getAttachable(c.patient_id),
    getPacket(id),
    getSubmission(id),
    getAppeal(id),
    auditFor(id),
    store.find<Policy>("policies", { insurer: c.insurer }),
    store.find<CaseDoc>("cases", { patient_id: c.patient_id, procedure_code: c.procedure_code }),
  ]);
  return {
    case: c,
    patient,
    insurer,
    insurers: await store.find<Insurer>("insurers", {}, { sort: { _id: 1 } }),
    policy: policies.find((p) => p._id === c.policy_id) ?? policies.find((p) => p.procedure_codes.includes(c.procedure_code)) ?? null,
    procedure: { code: c.procedure_code, ...CPT[c.procedure_code] },
    docs,
    attachable,
    packet,
    submission,
    appeal,
    audit: audit.slice(0, 40),
    siblings: siblings.map((s) => ({ id: s._id, insurer: s.insurer, status: s.status })),
    cache_available: await hasCache(c),
    provider: providerInfo(),
    eval: readEvalResults(),
  };
}
export type CaseView = NonNullable<Awaited<ReturnType<typeof caseView>>>;

export async function listCases() {
  const store = getStore();
  const [cases, patients, insurers] = await Promise.all([
    store.find<CaseDoc>("cases", {}, { sort: { updated_at: -1 } }),
    store.find<Patient>("patients"),
    store.find<Insurer>("insurers"),
  ]);
  return cases.map((c) => {
    const p = patients.find((x) => x._id === c.patient_id);
    const ins = insurers.find((x) => x._id === c.insurer);
    return {
      id: c._id,
      patient: p ? { id: p._id, label: p.label, name_masked: p.name_masked, initials: p.initials, age: p.age, sex: p.sex, mrn: p.mrn } : null,
      insurer: ins ?? null,
      procedure: { code: c.procedure_code, name: procedureName(c.procedure_code) },
      status: c.status,
      readiness: c.readiness?.score ?? null,
      open_gaps: c.gaps.filter((g) => g.status === "open").length,
      updated_at: c.updated_at,
    };
  });
}
export type CaseRow = Awaited<ReturnType<typeof listCases>>[number];

export async function analytics() {
  const store = getStore();
  const [cases, packets, insurers, patients] = await Promise.all([
    store.find<CaseDoc>("cases"),
    store.find<Packet>("packets"),
    store.find<Insurer>("insurers"),
    store.find<Patient>("patients"),
  ]);
  const scored = cases.filter((c) => c.readiness);
  const withGaps = cases.filter((c) => c.gaps.some((g) => g.status === "open"));
  const minutesPerPacket = Number(process.env.ESTIMATED_MANUAL_MINUTES_PER_PACKET || 30);
  const gapsByReason = new Map<string, number>();
  for (const c of cases) {
    for (const g of c.gaps.filter((x) => x.status === "open")) {
      const crit = c.criteria.find((x) => x.id === g.criterion_id);
      const key = crit?.title ?? g.criterion_id;
      gapsByReason.set(key, (gapsByReason.get(key) ?? 0) + 1);
    }
  }
  const priority = (c: CaseDoc) =>
    c.status === "DENIED" ? 0 : c.status === "NEEDS_INFO" ? 1 : c.status === "APPEAL_DRAFTED" ? 2 : c.status === "READY_FOR_REVIEW" ? 3 : 9;
  const needsAttention = cases
    .filter((c) => priority(c) < 9)
    .sort((a, b) => priority(a) - priority(b) || b.updated_at.localeCompare(a.updated_at))
    .slice(0, 6)
    .map((c) => {
      const p = patients.find((x) => x._id === c.patient_id);
      const ins = insurers.find((x) => x._id === c.insurer);
      const gap = c.gaps.find((g) => g.status === "open");
      return {
        id: c._id,
        patient: p ? `${p.label} (${p.name_masked})` : c.patient_id,
        procedure: procedureName(c.procedure_code),
        insurer: ins?.name ?? c.insurer,
        status: c.status,
        readiness: c.readiness?.score ?? null,
        reason: gap?.question ?? (c.status === "DENIED" ? "Denied by insurer: draft an appeal" : c.status === "READY_FOR_REVIEW" ? "Packet ready for human review" : "Appeal draft waiting for review"),
        target_role: gap?.target_role ?? "coordinator",
      };
    });
  const grounding = cases.reduce((a, c) => ({ verified: a.verified + c.grounding.verified, returned: a.returned + c.grounding.returned }), { verified: 0, returned: 0 });
  const statusCounts = cases.reduce<Record<string, number>>((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});
  return {
    kpis: {
      open_cases: cases.filter((c) => !CLOSED.includes(c.status)).length,
      total_cases: cases.length,
      cases_with_gaps: withGaps.length,
      open_gaps: withGaps.reduce((n, c) => n + c.gaps.filter((g) => g.status === "open").length, 0),
      avg_readiness: scored.length ? Math.round(scored.reduce((s, c) => s + (c.readiness?.score ?? 0), 0) / scored.length) : null,
      packets_drafted: packets.length,
      est_minutes_saved: packets.length * minutesPerPacket,
      minutes_per_packet_assumption: minutesPerPacket,
    },
    needs_attention: needsAttention,
    gaps_by_reason: [...gapsByReason.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    status_counts: statusCounts,
    grounding,
    eval: readEvalResults(),
    provider: providerInfo(),
  };
}

export interface EvalResults {
  ran_at: string;
  provider: string;
  cases: number;
  criteria_accuracy: { correct: number; total: number };
  grounding: { verified: number; returned: number };
  gap_recall: { caught: number; total: number };
}

export function readEvalResults(): EvalResults | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "eval", "results.json"), "utf8")) as EvalResults;
  } catch {
    return null;
  }
}

export async function newCaseOptions() {
  const store = getStore();
  const [patients, insurers] = await Promise.all([
    store.find<Patient>("patients", {}, { sort: { _id: 1 } }),
    store.find<Insurer>("insurers", {}, { sort: { _id: 1 } }),
  ]);
  return {
    patients: patients.map((p) => ({ id: p._id, label: p.label, name_masked: p.name_masked, age: p.age, sex: p.sex, procedure_code: p.procedure_code, default_insurer: p.default_insurer })),
    insurers,
    procedures: Object.entries(CPT).map(([code, v]) => ({ code, name: v.name })),
    provider: providerInfo(),
  };
}

