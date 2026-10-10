import { after } from "next/server";
import { actorOf, fail, handle, ok } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { getStore } from "@/lib/db";
import { recheckWithEvidence, refreshAfterDecision } from "@/lib/agents/pipeline";
import { getCase, now, updateCase } from "@/lib/repo";
import type { ChartDocument, GapAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: GapAction[] = ["attach", "note", "not_applicable", "confirm_not_done"];

async function extractUpload(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  return new TextDecoder().decode(buf);
}

// Resolve a gap: attach a document, add a note, mark not applicable, or confirm not done.
// Attach / note add evidence to the chart and re-run the matcher for that criterion only.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string; gapId: string }> }) => {
  const { id, gapId } = await params;
  let fields: Record<string, string> = {};
  let file: File | null = null;
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData();
    form.forEach((v, k) => { if (typeof v === "string") fields[k] = v; else file = v; });
  } else {
    fields = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, string>;
  }
  const action = fields.action as GapAction;
  if (!ACTIONS.includes(action)) return fail(`action must be one of ${ACTIONS.join(", ")}`);
  const actor = actorOf(fields);

  const c = await getCase(id);
  if (!c) return fail("Case not found", 404);
  if (!["NEEDS_INFO", "READY_FOR_REVIEW"].includes(c.status)) return fail(`Gaps cannot be changed while the case is ${c.status}`, 409);
  const gap = c.gaps.find((g) => g.id === gapId);
  if (!gap) return fail("Gap not found", 404);
  const store = getStore();

  if (action === "attach" || action === "note") {
    let doc: ChartDocument;
    if (action === "attach" && fields.doc_id) {
      const sample = await store.findOne<ChartDocument>("documents", { patient_id: c.patient_id, doc_id: fields.doc_id });
      if (!sample) return fail("Document not found", 404);
      doc = { ...sample, attachable: false, created_at: now() };
      await store.replaceOne("documents", doc);
    } else {
      const upload = file as File | null;
      const text = action === "note" ? (fields.note ?? "").trim() : upload ? (await extractUpload(upload)).trim() : "";
      if (text.length < 10) return fail(action === "note" ? "The note is too short" : "Attach a .txt or .pdf file with readable text");
      const n = (await store.count("documents", { patient_id: c.patient_id })) + 1;
      doc = {
        _id: `${c.patient_id}-doc-${n}-${Date.now()}`,
        patient_id: c.patient_id,
        doc_id: `${c.patient_id.replace("PT-", "")}-${action === "note" ? "addendum" : "upload"}_${String(n).padStart(2, "0")}`,
        type: action === "note" ? "addendum" : "upload",
        title: action === "note" ? `Addendum by ${actor}` : upload?.name ?? "Uploaded document",
        date: now().slice(0, 10),
        author: actor,
        text,
        created_at: now(),
      };
      await store.insertOne("documents", doc);
    }
    await appendAudit({ case_id: id, actor_type: "human", actor, action: action === "note" ? "NOTE_ADDED" : "DOCUMENT_ATTACHED", payload: { gap: gapId, criterion: gap.criterion_id, doc_id: doc.doc_id, title: doc.title } });
    await updateCase(id, {
      status: "RUNNING",
      gaps: c.gaps.map((g) => (g.id === gapId ? { ...g, resolved_by: actor, resolution: `${action === "note" ? "Note added" : "Attached"}: ${doc.title}` } : g)),
    });
    after(() => recheckWithEvidence(id, gap.criterion_id, [doc], actor));
    return ok({ rechecking: true, doc_id: doc.doc_id }, 202);
  }

  const t = now();
  if (action === "not_applicable") {
    await updateCase(id, {
      status: "RUNNING",
      gaps: c.gaps.map((g) => (g.id === gapId ? { ...g, status: "not_applicable", resolved_by: actor, resolved_at: t, resolution: "Marked not applicable" } : g)),
      results: c.results.map((r) => (r.criterion_id === gap.criterion_id ? { ...r, not_applicable: true, decided_by: "human", reasoning: `Marked not applicable by ${actor}.` } : r)),
    });
  } else {
    await updateCase(id, {
      status: "RUNNING",
      gaps: c.gaps.map((g) => (g.id === gapId ? { ...g, status: "confirmed_missing", resolved_by: actor, resolved_at: t, resolution: "Confirmed not done" } : g)),
    });
  }
  await appendAudit({ case_id: id, actor_type: "human", actor, action: action === "not_applicable" ? "GAP_MARKED_NOT_APPLICABLE" : "GAP_CONFIRMED_NOT_DONE", payload: { gap: gapId, criterion: gap.criterion_id } });
  after(() => refreshAfterDecision(id, actor));
  return ok({ refreshing: true }, 202);
});
