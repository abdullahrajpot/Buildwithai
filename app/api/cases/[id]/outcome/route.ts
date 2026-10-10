import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { getStore } from "@/lib/db";
import { getCase, getSubmission, updateCase } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Records the (mock) insurer decision so the demo can continue into the appeal flow.
export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ outcome: "approved" | "denied"; reason: string; actor: string }>(req);
  if (b.outcome !== "approved" && b.outcome !== "denied") return fail("outcome must be approved or denied");
  const [c, sub] = await Promise.all([getCase(id), getSubmission(id)]);
  if (!c || !sub) return fail("Case or submission not found", 404);
  if (c.status !== "SUBMITTED") return fail("Only submitted cases can receive an outcome", 409);
  await getStore().replaceOne("submissions", { ...sub, outcome: b.outcome, outcome_reason: b.reason ?? null });
  const status = b.outcome === "approved" ? "PAYER_APPROVED" : "DENIED";
  await updateCase(id, { status });
  await appendAudit({ case_id: id, actor_type: "human", actor: actorOf(b), action: b.outcome === "approved" ? "PAYER_APPROVED_MOCK" : "PAYER_DENIED_MOCK", payload: { reason: b.reason ?? null } });
  return ok({ status });
});
