import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { getStore } from "@/lib/db";
import { getCase, getSubmission, now, updateCase } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mock submission to the insurer. No external system is contacted.
export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const actor = actorOf(await body<{ actor: string }>(req));
  const [c, sub] = await Promise.all([getCase(id), getSubmission(id)]);
  if (!c || !sub) return fail("Case or approval not found", 404);
  if (c.status !== "APPROVED_BY_HUMAN") return fail("Only human-approved packets can be submitted", 409);
  const ref = `${c.insurer}-PA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
  const updated = { ...sub, mock_reference: ref, submitted_at: now() };
  await getStore().replaceOne("submissions", updated);
  await updateCase(id, { status: "SUBMITTED" });
  await appendAudit({ case_id: id, actor_type: "human", actor, action: "SUBMITTED_MOCK", payload: { mock_reference: ref } });
  return ok(updated);
});
