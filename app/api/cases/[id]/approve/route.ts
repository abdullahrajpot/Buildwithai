import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { getStore } from "@/lib/db";
import { getCase, getPacket, now, updateCase } from "@/lib/repo";
import type { Submission } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Human approval gate. Nothing is submitted without this click, and only a verified packet with no
// open gaps can be approved.
export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const actor = actorOf(await body<{ actor: string }>(req));
  const [c, packet] = await Promise.all([getCase(id), getPacket(id)]);
  if (!c || !packet) return fail("Case or packet not found", 404);
  if (c.status !== "READY_FOR_REVIEW") return fail(`Only cases that are ready for review can be approved (current: ${c.status})`, 409);
  if (c.gaps.some((g) => g.status === "open")) return fail("Resolve the open gaps before approving", 409);
  if (packet.verifier_status !== "PASS") return fail("The packet has not passed verification", 409);

  const submission: Submission = {
    _id: id, case_id: id, approved_by: actor, approved_at: now(), mock_reference: null, submitted_at: null, outcome: "pending", outcome_reason: null,
  };
  await getStore().replaceOne("submissions", submission);
  await updateCase(id, { status: "APPROVED_BY_HUMAN" });
  await appendAudit({ case_id: id, actor_type: "human", actor, action: "PACKET_APPROVED", payload: { packet_version: packet.version, readiness: c.readiness?.score ?? null } });
  return ok(submission);
});
