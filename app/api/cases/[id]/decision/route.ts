import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { getCase, updateCase } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reviewer decisions other than approval: request changes (back to the team) or reject the packet.
export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ decision: "request_changes" | "reject"; comment: string; actor: string }>(req);
  if (b.decision !== "request_changes" && b.decision !== "reject") return fail("decision must be request_changes or reject");
  const c = await getCase(id);
  if (!c) return fail("Case not found", 404);
  if (!["NEEDS_INFO", "READY_FOR_REVIEW"].includes(c.status)) return fail(`No review decision is possible while the case is ${c.status}`, 409);
  const status = b.decision === "reject" ? "REJECTED_BY_REVIEWER" : "NEEDS_INFO";
  await updateCase(id, { status });
  await appendAudit({ case_id: id, actor_type: "human", actor: actorOf(b), action: b.decision === "reject" ? "PACKET_REJECTED" : "CHANGES_REQUESTED", payload: { comment: b.comment ?? "" } });
  return ok({ status });
});
