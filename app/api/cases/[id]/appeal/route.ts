import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { getStore } from "@/lib/db";
import { getAppeal, now } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Human review of the appeal draft: save edits, approve, then mark as sent (mock).
export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ action: "save" | "approve" | "send"; letter_md: string; actor: string }>(req);
  const appeal = await getAppeal(id);
  if (!appeal) return fail("No appeal draft for this case", 404);
  const actor = actorOf(b);
  if (b.action === "save") {
    if (appeal.status !== "draft") return fail("Only drafts can be edited", 409);
    if (!b.letter_md || b.letter_md.trim().length < 50) return fail("The appeal letter is too short");
    const updated = { ...appeal, letter_md: b.letter_md, updated_at: now() };
    await getStore().replaceOne("appeals", updated);
    await appendAudit({ case_id: id, actor_type: "human", actor, action: "APPEAL_EDITED", payload: {} });
    return ok(updated);
  }
  if (b.action === "approve") {
    if (appeal.status !== "draft") return fail("The appeal is already approved", 409);
    const updated = { ...appeal, status: "approved_to_send" as const, updated_at: now() };
    await getStore().replaceOne("appeals", updated);
    await appendAudit({ case_id: id, actor_type: "human", actor, action: "APPEAL_APPROVED", payload: {} });
    return ok(updated);
  }
  if (b.action === "send") {
    if (appeal.status !== "approved_to_send") return fail("Approve the appeal before sending", 409);
    const updated = { ...appeal, status: "sent" as const, updated_at: now() };
    await getStore().replaceOne("appeals", updated);
    await appendAudit({ case_id: id, actor_type: "human", actor, action: "APPEAL_SENT_MOCK", payload: {} });
    return ok(updated);
  }
  return fail("action must be save, approve or send");
});
