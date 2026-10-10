// Runs the agents in order and records a timeline event per step on the case document
// (the UI polls the case every second). Plain async functions, no orchestration library.
import { createHash } from "node:crypto";
import { appendAudit } from "../audit";
import { getStore } from "../db";
import { newStats } from "../evidenceValidator";
import { configuredProvider, providerLabel } from "../llm";
import { getCase, getChart, getInsurer, getPacket, getPatient, getPolicyFor, now, updateCase } from "../repo";
import type {
  CaseDoc, CaseStatus, ChartDocument, Fact, MatchResult, Packet, PipelineEvent, Provider, RunCacheEntry, StepKey,
} from "../types";
import { runGapCloser } from "./gapCloser";
import { runIntake } from "./intake";
import { runMatcher } from "./matcher";
import { retrievePolicy } from "./policy";
import { computeReadiness } from "./readiness";
import { runVerifier } from "./verifier";
import { runWriter } from "./writer";

export const STEPS: { step: StepKey; label: string }[] = [
  { step: "intake", label: "Intake" },
  { step: "policy", label: "Policy retrieval" },
  { step: "matcher", label: "Criteria matching" },
  { step: "gaps", label: "Gap check" },
  { step: "writer", label: "Packet writer" },
  { step: "verifier", label: "Verifier" },
  { step: "readiness", label: "Readiness score" },
];

const freshEvents = (): PipelineEvent[] => STEPS.map((s) => ({ ...s, status: "pending" }));
const delay = () => {
  const ms = Number(process.env.PIPELINE_STEP_DELAY_MS ?? 450);
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
};
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w === "criterion" ? "criteria" : `${w}s`}`;

/** Tracks timeline events for one run and persists them after every change. */
class Timeline {
  constructor(private caseId: string, public events: PipelineEvent[]) {}
  private async save() { await updateCase(this.caseId, { events: this.events }); }
  async run<T extends { summary: string; used?: Provider; warning?: string }>(step: StepKey, fn: () => Promise<T>): Promise<T> {
    const ev = this.events.find((e) => e.step === step)!;
    Object.assign(ev, { status: "running", started_at: now(), summary: undefined, warning: undefined, finished_at: undefined, duration_ms: undefined });
    await this.save();
    const t0 = Date.now();
    try {
      const out = await fn();
      Object.assign(ev, { status: "done", summary: out.summary, provider: out.used, warning: out.warning, finished_at: now(), duration_ms: Date.now() - t0 });
      await this.save();
      await delay();
      return out;
    } catch (e) {
      Object.assign(ev, { status: "failed", summary: (e as Error).message, finished_at: now(), duration_ms: Date.now() - t0 });
      await this.save();
      throw e;
    }
  }
  async markPending(steps: StepKey[]) {
    for (const e of this.events) if (steps.includes(e.step)) Object.assign(e, { status: "pending", summary: undefined, warning: undefined, duration_ms: undefined });
    await this.save();
  }
}

async function loadContext(caseId: string) {
  const caseDoc = await getCase(caseId);
  if (!caseDoc) throw new Error(`Case ${caseId} not found`);
  const [patient, docs, insurer] = await Promise.all([getPatient(caseDoc.patient_id), getChart(caseDoc.patient_id), getInsurer(caseDoc.insurer)]);
  if (!patient || !insurer) throw new Error("Case references a missing patient or insurer. Run the seed script.");
  return { caseDoc, patient, docs, insurer };
}

/** Merge AI results with decisions a human already made (human decisions survive re-runs). */
function keepHumanDecisions(results: MatchResult[], previous: MatchResult[]) {
  return results.map((r) => previous.find((p) => p.criterion_id === r.criterion_id && p.decided_by === "human") ?? r);
}

function statusFor(caseDoc: Pick<CaseDoc, "gaps">): CaseStatus {
  return caseDoc.gaps.some((g) => g.status === "open") ? "NEEDS_INFO" : "READY_FOR_REVIEW";
}

/** Gap check -> packet writer (+1 retry on verifier FAIL) -> verifier -> readiness. Shared by full runs and re-checks. */
async function finalize(caseId: string, tl: Timeline, provider: Provider, actor: string) {
  const { caseDoc, patient, docs, insurer } = await loadContext(caseId);
  const policy = await getPolicyFor(caseDoc.insurer, caseDoc.procedure_code);
  if (!policy) throw new Error("Policy missing for this case");

  const gapOut = await tl.run("gaps", async () => {
    const g = await runGapCloser(caseDoc.criteria, caseDoc.results, caseDoc.facts, caseDoc.procedure_code, caseDoc.gaps, provider);
    const open = g.gaps.filter((x) => x.status === "open");
    return { ...g, summary: open.length ? `${plural(open.length, "gap")} ${open.length === 1 ? "needs" : "need"} input before submission` : "No open gaps" };
  });
  caseDoc.gaps = gapOut.gaps;
  await updateCase(caseId, { gaps: caseDoc.gaps });
  await appendAudit({ case_id: caseId, actor_type: "ai", actor: providerLabel(gapOut.used), action: "GAPS_IDENTIFIED", payload: { gaps: caseDoc.gaps.filter((g) => g.status === "open").map((g) => ({ criterion: g.criterion_id, question: g.question, to: g.target_role })) } });

  const previous = await getPacket(caseId);
  let issues: string[] | undefined;
  let draft: Awaited<ReturnType<typeof runWriter>> | null = null;
  let verdict: Awaited<ReturnType<typeof runVerifier>> | null = null;
  let attempts = 0;
  for (attempts = 1; attempts <= 2; attempts++) {
    draft = await tl.run("writer", async () => {
      const w = await runWriter({ caseDoc, patient, docs, insurer, policy, issues }, provider);
      return { ...w, summary: `Letter drafted with ${plural(new Set([...w.letter_md.matchAll(/\[(\d+)\]/g)].map((m) => m[1])).size, "citation")}${attempts > 1 ? " (retry with verifier issues)" : ""}` };
    });
    verdict = await tl.run("verifier", async () => {
      const v = await runVerifier(draft!.letter_md, draft!.citations, caseDoc, patient, docs, provider);
      const passed = v.checks.filter((c) => c.passed).length;
      return { ...v, summary: `${v.status}: ${passed} of ${v.checks.length} checks passed` };
    });
    // Retry the writer once with the issues; the deterministic template would produce the same draft.
    if (verdict.status === "PASS" || draft.used === "rules") break;
    issues = verdict.issues;
  }
  const packet: Packet = {
    _id: caseId,
    case_id: caseId,
    letter_md: draft!.letter_md,
    form_json: draft!.form_json,
    citations: draft!.citations,
    verifier_status: verdict!.status,
    verifier_issues: verdict!.issues,
    checks: verdict!.checks,
    version: (previous?.version ?? 0) + 1,
    writer_attempts: Math.min(attempts, 2),
    edited_by_human: false,
    updated_at: now(),
  };
  await getStore().replaceOne("packets", packet);
  await appendAudit({ case_id: caseId, actor_type: "ai", actor: providerLabel(draft!.used), action: "PACKET_DRAFTED", payload: { version: packet.version, citations: packet.citations.length, verifier_status: packet.verifier_status, issues: packet.verifier_issues } });

  const readiness = await tl.run("readiness", async () => {
    const r = computeReadiness(caseDoc.criteria, caseDoc.results);
    return { readiness: r, summary: `Readiness ${r.score}${r.capped ? " (capped at 60: a required criterion is missing)" : ""}`, used: "rules" as Provider };
  });
  const status = statusFor(caseDoc);
  await updateCase(caseId, { readiness: readiness.readiness, status });
  await appendAudit({ case_id: caseId, actor_type: "ai", actor: "Readiness rules", action: "READINESS_SCORED", payload: { score: readiness.readiness.score, capped: readiness.readiness.capped, status } });
  await saveCache(caseId);
  void actor;
}

/** Full pipeline run: intake -> policy RAG -> matcher -> gaps -> writer -> verifier -> readiness. */
export async function runPipeline(caseId: string, actor: string) {
  const provider = configuredProvider();
  const start = await getCase(caseId);
  if (!start) throw new Error(`Case ${caseId} not found`);
  const tl = new Timeline(caseId, freshEvents());
  await updateCase(caseId, { status: "RUNNING", events: tl.events, error: null, from_cache: false, run_count: start.run_count + 1, provider_used: provider });
  await appendAudit({ case_id: caseId, actor_type: "human", actor, action: "PIPELINE_STARTED", payload: { provider: providerLabel(provider) } });

  try {
    const { docs } = await loadContext(caseId);
    const stats = newStats();

    const intake = await tl.run("intake", async () => {
      const r = await runIntake(docs, provider, stats);
      return { ...r, summary: `Extracted ${plural(r.facts.length, "fact")} from ${plural(docs.length, "document")}${stats.dropped.length ? `, rejected ${plural(stats.dropped.length, "unverifiable quote")}` : ""}` };
    });
    await updateCase(caseId, { facts: intake.facts, grounding: { verified: stats.verified, returned: stats.returned } });
    await appendAudit({ case_id: caseId, actor_type: "ai", actor: providerLabel(intake.used), action: "FACTS_EXTRACTED", payload: { facts: intake.facts.length, dropped_quotes: stats.dropped } });

    const caseDoc = (await getCase(caseId))!;
    const pol = await tl.run("policy", async () => {
      const p = await retrievePolicy(caseDoc.insurer, caseDoc.procedure_code, provider);
      return { ...p, summary: `Found ${plural(p.criteria.length, "criterion")} in ${p.policy.short} (${p.chunks.length} sections retrieved, ${p.retrieval === "embedding" ? "bge-small embeddings" : "lexical match"})` };
    });
    await updateCase(caseId, { criteria: pol.criteria, policy_id: pol.policy._id });
    await appendAudit({ case_id: caseId, actor_type: "ai", actor: providerLabel(pol.used), action: "POLICY_RETRIEVED", payload: { policy: pol.policy._id, sections: pol.chunks.map((c) => c.section), criteria: pol.criteria.map((c) => `${c.id} ${c.policy_ref}`) } });

    const match = await tl.run("matcher", async () => {
      const m = await runMatcher(pol.criteria, intake.facts, docs, provider, stats);
      const count = (s: string) => m.results.filter((r) => r.status === s && !r.not_applicable).length;
      return { ...m, summary: `${count("MET")} met, ${count("MISSING")} missing, ${count("UNCLEAR")} unclear` };
    });
    const results = keepHumanDecisions(match.results, caseDoc.results);
    await updateCase(caseId, { results, grounding: { verified: stats.verified, returned: stats.returned } });
    await appendAudit({ case_id: caseId, actor_type: "ai", actor: providerLabel(match.used), action: "CRITERIA_MATCHED", payload: { results: results.map((r) => ({ criterion: r.criterion_id, status: r.not_applicable ? "N/A" : r.status, reasoning: r.reasoning })) } });

    await finalize(caseId, tl, provider, actor);
  } catch (e) {
    await updateCase(caseId, { status: "DRAFT", error: (e as Error).message });
    await appendAudit({ case_id: caseId, actor_type: "system", actor: "pipeline", action: "PIPELINE_FAILED", payload: { error: (e as Error).message } });
  }
}

/** New evidence for one criterion: read only the new documents, re-run the matcher for that criterion only. */
export async function recheckWithEvidence(caseId: string, criterionId: string, newDocs: ChartDocument[], actor: string) {
  const provider = configuredProvider();
  const start = await getCase(caseId);
  if (!start) throw new Error(`Case ${caseId} not found`);
  const tl = new Timeline(caseId, start.events.length ? start.events : freshEvents());
  await updateCase(caseId, { status: "RUNNING", error: null });
  await tl.markPending(["intake", "matcher", "gaps", "writer", "verifier", "readiness"]);
  try {
    const { docs } = await loadContext(caseId);
    const stats = newStats();
    const intake = await tl.run("intake", async () => {
      const r = await runIntake(newDocs, provider, stats);
      return { ...r, summary: `Read ${plural(newDocs.length, "new document")}: ${plural(r.facts.length, "new fact")}` };
    });
    const facts: Fact[] = [...start.facts, ...intake.facts].map((f, i) => ({ ...f, id: `F${i + 1}` }));
    const grounding = { verified: start.grounding.verified + stats.verified, returned: start.grounding.returned + stats.returned };
    await updateCase(caseId, { facts, grounding });

    const target = start.criteria.find((c) => c.id === criterionId);
    if (!target) throw new Error(`Criterion ${criterionId} not found`);
    const context = start.criteria.filter((c) => c.id === criterionId || c.id === target.waived_by);
    const match = await tl.run("matcher", async () => {
      const m = await runMatcher(context, facts, docs, provider, stats);
      const r = m.results.find((x) => x.criterion_id === criterionId)!;
      return { ...m, result: r, summary: `Re-checked ${criterionId} only: ${r.status}` };
    });
    const results = start.results.map((r) => (r.criterion_id === criterionId ? match.result : r));
    await updateCase(caseId, {
      results,
      grounding: { verified: start.grounding.verified + stats.verified, returned: start.grounding.returned + stats.returned },
    });
    await appendAudit({ case_id: caseId, actor_type: "ai", actor: providerLabel(match.used), action: "CRITERION_RECHECKED", payload: { criterion: criterionId, status: match.result.status, reasoning: match.result.reasoning, new_documents: newDocs.map((d) => d.doc_id) } });
    await finalize(caseId, tl, provider, actor);
  } catch (e) {
    await updateCase(caseId, { status: statusFor(start), error: (e as Error).message });
    await appendAudit({ case_id: caseId, actor_type: "system", actor: "pipeline", action: "RECHECK_FAILED", payload: { error: (e as Error).message } });
  }
}

/** Recompute gaps, packet, and readiness after a human decision (no new evidence). */
export async function refreshAfterDecision(caseId: string, actor: string) {
  const provider = configuredProvider();
  const c = await getCase(caseId);
  if (!c) throw new Error(`Case ${caseId} not found`);
  const tl = new Timeline(caseId, c.events.length ? c.events : freshEvents());
  try {
    await tl.markPending(["gaps", "writer", "verifier", "readiness"]);
    await finalize(caseId, tl, provider, actor);
  } catch (e) {
    const latest = (await getCase(caseId)) ?? c;
    await updateCase(caseId, { status: statusFor(latest), error: (e as Error).message });
    await appendAudit({ case_id: caseId, actor_type: "system", actor: "pipeline", action: "REFRESH_FAILED", payload: { error: (e as Error).message } });
  }
}

// ---------- demo cache (spec 4: cache demo runs so the demo survives Wi-Fi or API failures) ----------

export function docsHash(docs: ChartDocument[]) {
  return createHash("sha1").update(docs.map((d) => `${d.doc_id}:${d.text}`).sort().join("|")).digest("hex").slice(0, 12);
}

async function cacheKey(c: CaseDoc) {
  const docs = await getChart(c.patient_id);
  return `${c.patient_id}|${c.procedure_code}|${c.insurer}|${docsHash(docs)}`;
}

async function saveCache(caseId: string) {
  const c = await getCase(caseId);
  if (!c) return;
  const packet = await getPacket(caseId);
  const entry: RunCacheEntry = {
    _id: await cacheKey(c),
    snapshot: { facts: c.facts, criteria: c.criteria, results: c.results, gaps: c.gaps, events: c.events, readiness: c.readiness, provider_used: c.provider_used, grounding: c.grounding, policy_id: c.policy_id, status: c.status },
    packet: packet ? (({ _id, case_id, ...rest }) => rest)(packet) : null,
    created_at: now(),
  };
  await getStore().replaceOne("run_cache", entry);
}

export async function hasCache(c: CaseDoc) {
  return !!(await getStore().findOne<RunCacheEntry>("run_cache", { _id: await cacheKey(c) }));
}

export async function loadFromCache(caseId: string, actor: string) {
  const c = await getCase(caseId);
  if (!c) throw new Error(`Case ${caseId} not found`);
  const entry = await getStore().findOne<RunCacheEntry>("run_cache", { _id: await cacheKey(c) });
  if (!entry) throw new Error("No cached run exists for this patient, procedure, and insurer.");
  await updateCase(caseId, { ...entry.snapshot, error: null, from_cache: true });
  if (entry.packet) await getStore().replaceOne("packets", { ...entry.packet, _id: caseId, case_id: caseId, updated_at: now() });
  await appendAudit({ case_id: caseId, actor_type: "human", actor, action: "CACHED_RUN_LOADED", payload: { cached_at: entry.created_at } });
}
