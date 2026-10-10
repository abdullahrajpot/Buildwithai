import { fail, handle, ok, type Params } from "@/lib/api";
import { caseView } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const view = await caseView(id);
  return view ? ok(view) : fail("Case not found", 404);
});
