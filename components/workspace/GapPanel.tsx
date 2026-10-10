"use client";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, ClipboardList, FilePlus2, Paperclip, Stethoscope, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useRole } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/misc";
import { api } from "@/lib/client";
import type { CaseView } from "@/lib/view";
import type { Gap, GapAction } from "@/lib/types";
import { clock, formatDate } from "@/lib/utils";

function useGapAction(caseId: string) {
  const qc = useQueryClient();
  const { actor } = useRole();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (gapId: string, action: GapAction, extra: Record<string, string> = {}, file?: File) => {
    setBusy(`${gapId}:${action}`);
    try {
      if (file) {
        const form = new FormData();
        form.set("action", action);
        form.set("actor", actor);
        form.set("file", file);
        await api(`/api/cases/${caseId}/gaps/${gapId}`, { method: "POST", body: form });
      } else {
        await api(`/api/cases/${caseId}/gaps/${gapId}`, { method: "POST", json: { action, actor, ...extra } });
      }
      await qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy };
}

function AttachDialog({ open, onOpenChange, view, gap, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; view: CaseView; gap: Gap; onDone: () => void }) {
  const { run, busy } = useGapAction(view.case._id);
  const fileRef = useRef<HTMLInputElement>(null);
  const attach = async (args: { doc_id?: string; file?: File }) => {
    const ok = await run(gap.id, "attach", args.doc_id ? { doc_id: args.doc_id } : {}, args.file);
    if (ok) { onOpenChange(false); onDone(); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Attach a document" description={`Evidence for ${gap.criterion_id}. The copilot re-checks this criterion only.`} className="max-w-[600px]">
      <div className="flex flex-col gap-3">
        {view.attachable.length > 0 && (
          <div className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">From the hospital record (demo)</div>
        )}
        {view.attachable.map((d) => (
          <div key={d.doc_id} className="rounded-[10px] border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold">{d.title}</div>
                <div className="text-[12px] text-ink-3">{formatDate(d.date)} · {d.author}</div>
              </div>
              <Button size="sm" variant="primary" loading={busy === `${gap.id}:attach`} onClick={() => attach({ doc_id: d.doc_id })} icon={<Paperclip className="size-3.5" strokeWidth={1.75} />}>Attach</Button>
            </div>
            <p className="mt-2 line-clamp-3 font-serif text-[14px] leading-6 text-ink-2">{d.text}</p>
          </div>
        ))}
        <div className="rounded-[10px] border border-dashed border-line-strong p-4 text-center">
          <Upload className="mx-auto size-5 text-ink-3" strokeWidth={1.5} />
          <p className="mt-1 text-[13px] text-ink-2">Or upload a note as a .txt or .pdf file</p>
          <input ref={fileRef} type="file" accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attach({ file: f }); e.target.value = ""; }} />
          <Button size="sm" className="mt-3" onClick={() => fileRef.current?.click()} loading={busy === `${gap.id}:attach` && !view.attachable.length}>Choose file</Button>
        </div>
      </div>
    </Dialog>
  );
}

function GapCard({ gap, view }: { gap: Gap; view: CaseView }) {
  const { run, busy } = useGapAction(view.case._id);
  const [attachOpen, setAttachOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const crit = view.case.criteria.find((c) => c.id === gap.criterion_id);
  const result = view.case.results.find((r) => r.criterion_id === gap.criterion_id);
  const locked = view.case.status === "RUNNING";
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden rounded-[10px] border border-line border-t-[3px] border-t-missing bg-surface shadow-xs">
      <div className="p-4">
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          {gap.target_role === "physician" ? <Stethoscope className="size-3.5" strokeWidth={1.75} /> : <ClipboardList className="size-3.5" strokeWidth={1.75} />}
          <span className="font-medium">{gap.target_role === "physician" ? "Needs doctor input" : "Needs coordinator"}</span>
          <span className="ml-auto font-mono">{gap.criterion_id} · {crit?.policy_ref}</span>
        </div>
        <p className="mt-2 text-[15px] leading-[22px] font-semibold">{gap.question}</p>
        {result?.evidence[0] && (
          <p className="mt-2 border-l-[3px] border-highlight-edge bg-highlight-faint py-1 pl-3 font-serif text-[14px] leading-6 italic">&ldquo;{result.evidence[0].quote}&rdquo;</p>
        )}
        {gap.resolution && <p className="mt-2 text-[12px] text-ink-3">Last action: {gap.resolution} ({gap.resolved_by})</p>}
        <AnimatePresence>
          {noteOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <label className="mt-3 flex flex-col gap-2">
                <span className="text-[13px] font-medium text-ink-2">Addendum (becomes part of the chart)</span>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: Completed 6 weeks of physiotherapy (05 Aug to 16 Sep 2026) with minimal relief." className="font-serif" />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button>
                <Button size="sm" variant="primary" disabled={note.trim().length < 10} loading={busy === `${gap.id}:note`} onClick={async () => { if (await run(gap.id, "note", { note })) { setNote(""); setNoteOpen(false); } }}>Save note</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!noteOpen && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={locked} onClick={() => setAttachOpen(true)} icon={<Paperclip className="size-3.5" strokeWidth={1.75} />}>Attach document</Button>
            <Button size="sm" disabled={locked} onClick={() => setNoteOpen(true)} icon={<FilePlus2 className="size-3.5" strokeWidth={1.75} />}>Add note</Button>
            <Button size="sm" variant="ghost" disabled={locked} loading={busy === `${gap.id}:not_applicable`} onClick={() => run(gap.id, "not_applicable")}>Mark N/A</Button>
            <Button size="sm" variant="ghost" disabled={locked} loading={busy === `${gap.id}:confirm_not_done`} onClick={() => run(gap.id, "confirm_not_done")}>Confirm not done</Button>
          </div>
        )}
      </div>
      <AttachDialog open={attachOpen} onOpenChange={setAttachOpen} view={view} gap={gap} onDone={() => toast.success("Document attached. Re-checking the criterion.")} />
    </motion.div>
  );
}

export function GapPanel({ view }: { view: CaseView }) {
  const open = view.case.gaps.filter((g) => g.status === "open");
  const closed = view.case.gaps.filter((g) => g.status !== "open");
  if (!view.case.gaps.length) {
    if (!view.case.criteria.length) return null;
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-met-line bg-met-bg px-3 py-2.5 text-[13px] text-met">
        <CheckCircle2 className="size-4" strokeWidth={1.75} /> No documentation gaps. Every required criterion has evidence.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {open.map((g) => <GapCard key={g.id} gap={g} view={view} />)}
      </AnimatePresence>
      {closed.map((g) => (
        <motion.div key={g.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2 rounded-[8px] border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-2">
          <CheckCircle2 className={g.status === "confirmed_missing" ? "mt-0.5 size-3.5 shrink-0 text-missing" : "mt-0.5 size-3.5 shrink-0 text-met"} strokeWidth={1.75} />
          <span>
            <span className="font-mono">{g.criterion_id}</span>{" "}
            {g.status === "resolved" ? "Resolved" : g.status === "not_applicable" ? "Marked not applicable" : "Confirmed not done"}
            {g.resolved_by ? ` by ${g.resolved_by}` : ""}
            {g.resolved_at ? ` at ${clock(g.resolved_at)}` : ""}
            {g.resolution && g.status === "resolved" ? `. ${g.resolution}` : ""}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
