import { actorOf, body, fail, handle, ok, type Params } from "@/lib/api";
import { loadFromCache } from "@/lib/agents/pipeline";
import { getCase } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Demo safety: replace a failed or slow live run with the cached result for the same inputs.
export const POST = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const c = await getCase(id);
  if (!c) return fail("Case not found", 404);
  if (c.status === "RUNNING") return fail("Wait for the current run to finish or fail", 409);
  try {
    await loadFromCache(id, actorOf(await body<{ actor: string }>(req)));
  } catch (e) {
    return fail((e as Error).message, 404);
  }
  return ok({ loaded: true });
});
