import { after } from "next/server";
import { actorOf, body, fail, handle, ok } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { isKnownCpt } from "@/lib/codes";
import { getStore } from "@/lib/db";
import { runPipeline } from "@/lib/agents/pipeline";
import { getInsurer, getPatient, newCase, nextCaseId, updateCase } from "@/lib/repo";
import { listCases, newCaseOptions } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => ok({ cases: await listCases(), options: await newCaseOptions() }));

export const POST = handle(async (req: Request) => {
  const b = await body<{ patient_id: string; procedure_code: string; insurer: string; run: boolean; actor: string }>(req);
  if (!b.patient_id || !b.procedure_code || !b.insurer) return fail("patient_id, procedure_code and insurer are required");
  if (!isKnownCpt(b.procedure_code)) return fail(`Unknown procedure ${b.procedure_code}`);
  const [patient, insurer] = await Promise.all([getPatient(b.patient_id), getInsurer(b.insurer)]);
  if (!patient) return fail("Unknown patient", 404);
  if (!insurer) return fail("Unknown insurer", 404);
  const id = await nextCaseId();
  await getStore().insertOne("cases", newCase(id, { patient_id: patient._id, procedure_code: b.procedure_code, insurer: insurer._id, icd10_codes: patient.icd10_codes }));
  const actor = actorOf(b);
  await appendAudit({ case_id: id, actor_type: "human", actor, action: "CASE_CREATED", payload: { patient: patient._id, procedure: b.procedure_code, insurer: insurer._id } });
  if (b.run !== false) {
    await updateCase(id, { status: "RUNNING" });
    after(() => runPipeline(id, actor));
  }
  return ok({ id }, 201);
});
