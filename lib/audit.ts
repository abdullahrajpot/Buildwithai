// Append-only audit trail. The only write path is insertOne; the store refuses updates and deletes
// on audit_log (lib/db.ts). Every AI output and every human decision is logged here.
import { randomUUID } from "node:crypto";
import { getStore } from "./db";
import type { ActorType } from "./types";

export async function appendAudit(e: {
  case_id: string | null;
  actor_type: ActorType;
  actor: string;
  action: string;
  payload?: Record<string, unknown>;
}) {
  await getStore().insertOne("audit_log", {
    _id: randomUUID(),
    case_id: e.case_id,
    actor_type: e.actor_type,
    actor: e.actor,
    action: e.action,
    payload: e.payload ?? {},
    created_at: new Date().toISOString(),
  });
}
