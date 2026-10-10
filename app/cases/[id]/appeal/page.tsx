"use client";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CheckCircle2, FileText, Gavel, PencilLine, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Letter } from "@/components/Letter";
import { useRole } from "@/components/providers";
import { Button, ButtonLink } from "@/components/ui/button";
import { Caption, Card, EmptyState, ErrorCard, Mono, Skeleton, Textarea } from "@/components/ui/misc";
import { CaseStatusChip, Pill } from "@/components/ui/status";
import { api, useCase, useMeta } from "@/lib/client";
import type { Appeal, DenialReasonClass } from "@/lib/types";

const REASON: Record<DenialReasonClass, string> = {
  missing_documentation: "Missing documentation",
  not_medically_necessary: "Not medically necessary",
  wrong_code: "Wrong code",
  other: "Other",
};

/** Denial letter with the stated reason underlined in clay (yellow is reserved for chart evidence). */
function DenialText({ text, span }: { text: string; span: Appeal["denial_reason_span"] }) {
  const nodes: ReactNode[] = span
    ? [text.slice(0, span.start), <span key="r" className="underline decoration-missing decoration-2 underline-offset-4">{text.slice(span.start, span.end)}</span>, text.slice(span.end)]
    : [text];
  return <div className="font-serif text-[15px] leading-[26px] whitespace-pre-line">{nodes}</div>;
}

export default function AppealPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { actor } = useRole();
  const meta = useMeta();
  const { data: view, isLoading, error, refetch } = useCase(id);
  const [denial, setDenial] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (error) return <div className="pt-6"><ErrorCard title="Could not load the case" message={(error as Error).message} actions={<Button size="sm" onClick={() => refetch()}>Retry</Button>} /></div>;
  if (isLoading || !view) return <div className="grid grid-cols-1 gap-5 pt-4 xl:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-[560px]" /></div>;

  const c = view.case;
  const appeal = view.appeal;
  const call = async (key: string, url: string, json: Record<string, unknown>, msg: string) => {
    setBusy(key);
    try {
      await api(url, { method: "POST", json: { ...json, actor } });
      await qc.invalidateQueries({ queryKey: ["case", id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      toast.success(msg);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!["DENIED", "APPEAL_DRAFTED"].includes(c.status)) {
    return (
      <Card className="mt-4">
        <EmptyState icon={Gavel} title="This case has not been denied." body="Appeals are drafted only after an insurer denies a submitted request." action={<ButtonLink href={`/cases/${id}`}>Back to workspace</ButtonLink>} />
      </Card>
    );
  }

  return (
    <div className="pt-2">
      <div className="mb-4 rounded-[8px] border border-dashed border-line-strong px-3 py-1.5 text-center text-[12px] font-medium tracking-[0.04em] text-ink-3 uppercase">Mock denial for the demo</div>
      <div className="flex flex-wrap items-center gap-3 pb-5">
        <Link href={`/cases/${id}`} className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Workspace</Link>
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">Appeal</h1>
        <CaseStatusChip status={c.status} />
        <span className="text-[13px] text-ink-3">{view.patient?.label} · {view.procedure.name} · {view.insurer?.name}</span>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Rejection letter */}
        <section>
          <Caption className="mb-3">Rejection letter</Caption>
          <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[14px] border border-line bg-surface p-6 shadow-paper sm:p-8">
            {appeal ? (
              <DenialText text={appeal.denial_text} span={appeal.denial_reason_span} />
            ) : (
              <>
                <Textarea value={denial} onChange={(e) => setDenial(e.target.value)} placeholder="Paste the insurer's rejection letter here" className="min-h-[300px] w-full font-serif text-[15px] leading-[26px]" aria-label="Rejection letter" />
                <div className="mt-3 flex flex-wrap justify-between gap-2">
                  <Button size="sm" variant="ghost" icon={<FileText className="size-3.5" />} onClick={() => setDenial(meta.data?.sample_denial ?? "")} disabled={!meta.data?.sample_denial}>Use sample rejection letter</Button>
                  <Button variant="primary" icon={<Sparkles className="size-4" strokeWidth={1.75} />} loading={busy === "draft"} disabled={denial.trim().length < 40} onClick={() => call("draft", `/api/cases/${id}/denial`, { denial_text: denial }, "Appeal drafted. Review it before sending.")}>Draft appeal</Button>
                </div>
              </>
            )}
          </motion.article>
        </section>

        {/* Analysis + draft */}
        <section>
          <AnimatePresence mode="wait">
            {!appeal ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Caption className="mb-3">Appeal draft</Caption>
                <Card>
                  <EmptyState icon={Gavel} title="Add the rejection letter to begin." body="The copilot classifies the reason, searches the chart for counter-evidence, and drafts a cited appeal for your review." />
                </Card>
              </motion.div>
            ) : (
              <motion.div key="appeal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                <div>
                  <Caption className="mb-3">Classified reason</Caption>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="unclear">{REASON[appeal.reason_class]}</Pill>
                      {appeal.target_criterion_id && <Mono className="text-ink-3">{appeal.target_criterion_id} · {c.criteria.find((x) => x.id === appeal.target_criterion_id)?.policy_ref}</Mono>}
                    </div>
                    <p className="mt-2 text-[13px] text-ink-2">{appeal.reason_summary}</p>
                  </Card>
                </div>
                <div>
                  <Caption className="mb-3">Counter-evidence in the chart</Caption>
                  <div className="flex flex-col gap-2">
                    {appeal.counter_evidence.length === 0 ? (
                      <Card className="p-4 text-[13px] text-ink-3">No counter-evidence was found. Add documentation before appealing.</Card>
                    ) : appeal.counter_evidence.map((e, i) => (
                      <motion.div key={`${e.doc_id}:${e.char_start}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                        <Card className="p-4">
                          <div className="flex items-center gap-2 text-[12px] text-ink-3"><span className="font-medium text-ink-2">{e.doc_title}</span><span className="ml-auto font-mono">{e.criterion_id} · {e.doc_id}</span></div>
                          <blockquote className="mt-2 rounded-r-[6px] border-l-[3px] border-highlight-edge bg-highlight-faint py-1.5 pl-3 font-serif text-[15px] leading-6 italic">&ldquo;{e.quote}&rdquo;</blockquote>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-3 flex items-center">
                    <Caption>Appeal letter</Caption>
                    {appeal.status === "draft" && !editing && <Button size="sm" variant="ghost" className="ml-auto" icon={<PencilLine className="size-3.5" />} onClick={() => { setDraft(appeal.letter_md); setEditing(true); }}>Edit</Button>}
                  </div>
                  <article className="rounded-[14px] border border-line bg-surface p-6 shadow-paper sm:p-8">
                    {editing ? (
                      <>
                        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[360px] w-full font-mono text-[13px] leading-6" aria-label="Appeal Markdown" />
                        <div className="mt-3 flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                          <Button variant="primary" loading={busy === "save"} onClick={async () => { if (await call("save", `/api/cases/${id}/appeal`, { action: "save", letter_md: draft }, "Appeal saved")) setEditing(false); }}>Save</Button>
                        </div>
                      </>
                    ) : (
                      <Letter md={appeal.letter_md} citations={appeal.citations} caseId={id} />
                    )}
                  </article>
                </div>
                <Card className="p-4">
                  {appeal.status === "draft" && (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="flex-1 text-[13px] text-ink-2">A human reviews the appeal before anything is sent.</p>
                      <Button variant="primary" loading={busy === "approve"} disabled={editing} onClick={() => call("approve", `/api/cases/${id}/appeal`, { action: "approve" }, "Appeal approved. Logged to the audit trail.")}>Approve appeal</Button>
                    </div>
                  )}
                  {appeal.status === "approved_to_send" && (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="flex-1 text-[13px] text-ink-2">Approved. Ready to send to {view.insurer?.name}.</p>
                      <Button variant="primary" icon={<Send className="size-4" strokeWidth={1.75} />} loading={busy === "send"} onClick={() => call("send", `/api/cases/${id}/appeal`, { action: "send" }, "Appeal sent (mock)")}>Send appeal (mock)</Button>
                    </div>
                  )}
                  {appeal.status === "sent" && <p className="flex items-center gap-2 text-[13px] text-met"><CheckCircle2 className="size-4" /> Appeal sent (mock). Every step is in the audit trail.</p>}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
