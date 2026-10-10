import { after } from "next/server";
import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { runPipeline } from "@/lib/agents/pipeline";
import { getCase, updateCase } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCKED = ["RUNNING", "APPROVED_BY_HUMAN", "SUBMITTED", "PAYER_APPROVED", "DENIED", "APPEAL_DRAFTED"];

export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const c = await getCase(id);
  if (!c) return fail("Case not found", 404);
  if (LOCKED.includes(c.status)) return fail(`A case in status ${c.status} cannot be re-run`, 409);
  const actor = actorOf(await body<{ actor: string }>(req));
  await updateCase(id, { status: "RUNNING", error: null }); // so the UI starts polling immediately
  after(() => runPipeline(id, actor));
  return ok({ started: true }, 202);
});
