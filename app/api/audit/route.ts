import { handle, ok } from "@/lib/api";
import { getStore } from "@/lib/db";
import type { AuditEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const caseId = new URL(req.url).searchParams.get("case_id");
  const entries = await getStore().find<AuditEntry>("audit_log", caseId ? { case_id: caseId } : {}, { sort: { created_at: -1 }, limit: 300 });
  return ok({ entries });
});
