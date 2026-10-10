import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { getStore } from "@/lib/db";
import { configuredProvider } from "@/lib/llm";
import { runVerifier } from "@/lib/agents/verifier";
import { getCase, getChart, getPacket, getPatient, now } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const packet = await getPacket(id);
  return packet ? ok(packet) : fail("No packet yet. Run the copilot first.", 404);
});

// Human edit of the letter. The edited text goes through the verifier again before it can be approved.
export const PUT = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ letter_md: string; actor: string }>(req);
  if (!b.letter_md || b.letter_md.trim().length < 50) return fail("The letter is empty or too short");
  const [c, packet] = await Promise.all([getCase(id), getPacket(id)]);
  if (!c || !packet) return fail("Case or packet not found", 404);
  if (!["NEEDS_INFO", "READY_FOR_REVIEW"].includes(c.status)) return fail(`The packet is locked while the case is ${c.status}`, 409);
  const [patient, docs] = await Promise.all([getPatient(c.patient_id), getChart(c.patient_id)]);
  if (!patient) return fail("Patient not found", 404);
  const v = await runVerifier(b.letter_md, packet.citations, c, patient, docs, configuredProvider());
  const updated = { ...packet, letter_md: b.letter_md, verifier_status: v.status, verifier_issues: v.issues, checks: v.checks, version: packet.version + 1, edited_by_human: true, updated_at: now() };
  await getStore().replaceOne("packets", updated);
  await appendAudit({ case_id: id, actor_type: "human", actor: actorOf(b), action: "PACKET_EDITED", payload: { version: updated.version, verifier_status: v.status, issues: v.issues } });
  return ok(updated);
});
