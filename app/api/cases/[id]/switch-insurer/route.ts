import { after } from "next/server";
import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { getStore } from "@/lib/db";
import { runPipeline } from "@/lib/agents/pipeline";
import { getCase, getInsurer, newCase, nextCaseId, updateCase } from "@/lib/repo";
import type { CaseDoc } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Same patient, different insurer": opens (or creates and runs) the sibling case for another insurer.
export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ insurer: string; actor: string }>(req);
  const c = await getCase(id);
  if (!c) return fail("Case not found", 404);
  if (!b.insurer || !(await getInsurer(b.insurer))) return fail("Unknown insurer", 404);
  if (b.insurer === c.insurer) return ok({ id });
  const siblings = await getStore().find<CaseDoc>("cases", { patient_id: c.patient_id, procedure_code: c.procedure_code, insurer: b.insurer });
  const existing = siblings.sort((a, b2) => b2.updated_at.localeCompare(a.updated_at))[0];
  if (existing) return ok({ id: existing._id, created: false });
  const newId = await nextCaseId();
  await getStore().insertOne("cases", newCase(newId, { patient_id: c.patient_id, procedure_code: c.procedure_code, insurer: b.insurer, icd10_codes: c.icd10_codes }));
  const actor = actorOf(b);
  await appendAudit({ case_id: newId, actor_type: "human", actor, action: "CASE_CREATED", payload: { from_case: id, insurer: b.insurer } });
  await updateCase(newId, { status: "RUNNING" });
  after(() => runPipeline(newId, actor));
  return ok({ id: newId, created: true }, 201);
});
