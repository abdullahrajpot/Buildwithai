import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { draftAppeal } from "@/lib/agents/appeal";
import { getCase } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rejection letter in, classified reason + counter-evidence + appeal draft out.
export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ denial_text: string; actor: string }>(req);
  if (!b.denial_text || b.denial_text.trim().length < 40) return fail("Paste the full rejection letter");
  const c = await getCase(id);
  if (!c) return fail("Case not found", 404);
  if (!["DENIED", "APPEAL_DRAFTED"].includes(c.status)) return fail("Appeals can only be drafted for denied cases", 409);
  const actor = actorOf(b);
  await appendAudit({ case_id: id, actor_type: "human", actor, action: "DENIAL_LETTER_ADDED", payload: { length: b.denial_text.length } });
  return ok(await draftAppeal(id, b.denial_text.trim(), actor));
});
