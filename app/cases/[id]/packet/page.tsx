"use client";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Download, FileWarning, Lock, PencilLine, Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AuditList } from "@/components/AuditList";
import { Letter } from "@/components/Letter";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { useRole } from "@/components/providers";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Caption, Card, EmptyState, ErrorCard, Mono, Skeleton, Textarea } from "@/components/ui/misc";
import { CaseStatusChip } from "@/components/ui/status";
import { VerifierChecklist } from "@/components/VerifierChecklist";
import { api, useCase, useCaseAction } from "@/lib/client";
import type { Packet } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function ApproveButton({ disabled, onApprove }: { disabled: boolean; onApprove: () => Promise<void> }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  return (
    <Button
      variant="primary"
      className="w-full"
      disabled={disabled || state === "done"}
      loading={state === "busy"}
      onClick={async () => {
        setState("busy");
        try { await onApprove(); setState("done"); } catch { setState("idle"); }
      }}
      icon={state === "done" ? (
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden><motion.path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.32 }} /></svg>
      ) : undefined}
    >
      {state === "done" ? "Approved" : "Approve packet"}
    </Button>
  );
}

export default function PacketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { actor, role } = useRole();
  const { data: view, isLoading, error, refetch } = useCase(id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState<"request_changes" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const approve = useCaseAction(id, "/approve");
  const decide = useCaseAction<{ decision: string; comment: string }>(id, "/decision");
  const submit = useCaseAction(id, "/submit");
  const outcome = useCaseAction<{ outcome: string; reason: string }>(id, "/outcome");

  if (error) return <div className="pt-6"><ErrorCard title="Could not load the packet" message={(error as Error).message} actions={<Button size="sm" onClick={() => refetch()}>Retry</Button>} /></div>;
  if (isLoading || !view) {
    return <div className="grid grid-cols-1 gap-5 pt-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]"><Skeleton className="h-80" /><Skeleton className="h-[640px]" /><Skeleton className="h-96" /></div>;
  }
  const c = view.case;
  const p = view.packet;
  if (!p) {
    return (
      <Card className="mt-4">
        <EmptyState icon={FileWarning} title={c.status === "RUNNING" ? "The packet is being drafted." : "No packet yet."} body="The packet writer runs after the criteria check." action={<ButtonLink href={`/cases/${id}`}>Back to workspace</ButtonLink>} />
      </Card>
    );
  }

  const editable = c.status === "NEEDS_INFO" || c.status === "READY_FOR_REVIEW";
  const openGaps = c.gaps.filter((g) => g.status === "open").length;
  const blockers = [
    c.status === "RUNNING" && "The copilot is still running.",
    openGaps > 0 && `Resolve ${openGaps} open gap${openGaps > 1 ? "s" : ""} first.`,
    p.verifier_status !== "PASS" && "The packet must pass verification.",
    role === "physician" && "Approval is a coordinator or manager decision.",
  ].filter(Boolean) as string[];
  const f = p.form_json;
  const ev = view.eval;
  const confirmedMissing = c.gaps.filter((g) => g.status === "confirmed_missing").length;

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await api<Packet>(`/api/cases/${id}/packet`, { method: "PUT", json: { letter_md: draft, actor } });
      await qc.invalidateQueries({ queryKey: ["case", id] });
      setEditing(false);
      toast[updated.verifier_status === "PASS" ? "success" : "error"](updated.verifier_status === "PASS" ? `Saved version ${updated.version}. Verification passed.` : `Saved version ${updated.version}. Verification failed: fix the issues before approving.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-2">
      <div className="flex flex-wrap items-center gap-3 pb-5">
        <Link href={`/cases/${id}`} className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Workspace</Link>
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">Packet review</h1>
        <CaseStatusChip status={c.status} />
        <span className="text-[13px] text-ink-3">Version {p.version}{p.edited_by_human ? " (edited by a human)" : ""}{p.writer_attempts > 1 ? ", writer retried once" : ""}</span>
        <div className="ml-auto flex gap-2">
          {editable && !editing && <Button size="sm" onClick={() => { setDraft(p.letter_md); setEditing(true); }} icon={<PencilLine className="size-3.5" strokeWidth={1.75} />}>Edit letter</Button>}
          <a href={`/api/cases/${id}/packet/pdf`} className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-medium shadow-xs hover:border-line-strong"><Download className="size-3.5" strokeWidth={1.75} /> PDF</a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        {/* Form fields */}
        <aside className="order-2 xl:order-1">
          <Card className="p-4">
            <Caption>Request form</Caption>
            <dl className="mt-3 space-y-3 text-[13px]">
              {([
                ["Patient", `${f.patient_name_masked}, ${f.age_sex}`],
                ["MRN", f.mrn],
                ["Insurer", f.insurer],
                ["Policy", f.policy_id],
                ["CPT", `${f.cpt_code}`],
                ["ICD-10", f.icd10_codes.map((x) => x.code).join(", ")],
                ["Provider", f.provider_name],
                ["Provider ID", f.provider_id],
                ["Request date", formatDate(f.request_date)],
              ] as const).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-ink-3">{k}</dt>
                  <dd className={["MRN", "Policy", "CPT", "ICD-10", "Provider ID"].includes(k) ? "font-mono text-[12.5px]" : ""}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-4 text-ink-3">{f.cpt_description}. {f.icd10_codes.map((x) => `${x.code}: ${x.description}`).join("; ")}. Codes are a demo subset.</p>
          </Card>
        </aside>

        {/* Letter */}
        <section className="order-1 xl:order-2">
          <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[720px] rounded-[14px] border border-line bg-surface shadow-paper">
            <div className="flex items-center justify-between border-b border-line px-10 py-4">
              <div>
                <div className="text-[13px] font-semibold">{view.patient?.provider.facility}</div>
                <div className="text-[12px] text-ink-3">Letter of Medical Necessity</div>
              </div>
              <Mono className="text-ink-3">{formatDate(p.updated_at)}</Mono>
            </div>
            <div className="px-6 py-8 sm:px-10">
              <AnimatePresence mode="wait" initial={false}>
                {editing ? (
                  <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[560px] w-full font-mono text-[13px] leading-6" aria-label="Letter Markdown" />
                    <p className="mt-2 text-[12px] text-ink-3">Keep citation markers like [2] on every clinical sentence. Saving re-runs the verifier.</p>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                      <Button variant="primary" loading={saving} onClick={saveEdit}>Save and verify</Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Letter md={p.letter_md} citations={p.citations} caseId={id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.article>
        </section>

        {/* Right rail */}
        <aside className="order-3 flex flex-col gap-4">
          <Card className="p-5"><ReadinessGauge readiness={c.readiness} /></Card>
          <Card className="p-5">
            <VerifierChecklist checks={p.checks} status={p.verifier_status} />
            {ev && (
              <div className="mt-3 border-t border-line pt-3 text-[12.5px] leading-5 text-ink-2">
                <span className="tabular font-semibold text-ink">{ev.grounding.verified} of {ev.grounding.returned}</span> citations verified across our {ev.cases} test cases; criteria accuracy {ev.criteria_accuracy.correct}/{ev.criteria_accuracy.total}.
                <div className="text-[11.5px] text-ink-3">{ev.provider}</div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <Caption>Decision</Caption>
            {(c.status === "READY_FOR_REVIEW" || c.status === "NEEDS_INFO" || c.status === "RUNNING") && (
              <div className="mt-3 flex flex-col gap-2">
                <ApproveButton
                  disabled={blockers.length > 0}
                  onApprove={async () => {
                    try {
                      await approve.mutateAsync({});
                      toast.success("Packet approved. Logged to the audit trail.");
                    } catch (e) {
                      toast.error((e as Error).message);
                      throw e;
                    }
                  }}
                />
                {blockers.length > 0 && (
                  <ul className="space-y-1 text-[12px] text-ink-3">
                    {blockers.map((b) => <li key={b} className="flex gap-1.5"><Lock className="mt-0.5 size-3 shrink-0" />{b}</li>)}
                  </ul>
                )}
                {confirmedMissing > 0 && <p className="flex gap-1.5 text-[12px] text-unclear"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" />{confirmedMissing} required criterion confirmed not done. The insurer may deny this request.</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" disabled={c.status !== "READY_FOR_REVIEW"} onClick={() => setDecision("request_changes")}>Request changes</Button>
                  <Button size="sm" variant="danger" disabled={c.status === "RUNNING"} onClick={() => setDecision("reject")}>Reject</Button>
                </div>
              </div>
            )}
            {c.status === "APPROVED_BY_HUMAN" && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-[13px] text-ink-2">Approved by {view.submission?.approved_by}. Nothing has been sent yet.</p>
                <Button variant="primary" loading={submit.isPending} icon={<Send className="size-4" strokeWidth={1.75} />} onClick={() => submit.mutate({}, { onSuccess: () => toast.success("Submitted to the insurer (mock)"), onError: (e) => toast.error(e.message) })}>Submit to insurer (mock)</Button>
              </div>
            )}
            {c.status === "SUBMITTED" && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-[13px] text-ink-2">Submitted as <Mono>{view.submission?.mock_reference}</Mono>. Record the insurer&apos;s decision (mock):</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" icon={<Check className="size-3.5" />} loading={outcome.isPending} onClick={() => outcome.mutate({ outcome: "approved", reason: "" }, { onSuccess: () => toast.success("Recorded: insurer approved") })}>Approved</Button>
                  <Button size="sm" variant="danger" loading={outcome.isPending} onClick={() => outcome.mutate({ outcome: "denied", reason: "Recorded by coordinator" }, { onSuccess: () => router.push(`/cases/${id}/appeal`) })}>Denied</Button>
                </div>
              </div>
            )}
            {c.status === "PAYER_APPROVED" && <p className="mt-3 text-[13px] text-met">The insurer approved this request (mock).</p>}
            {(c.status === "DENIED" || c.status === "APPEAL_DRAFTED") && (
              <div className="mt-3"><ButtonLink href={`/cases/${id}/appeal`} variant="primary" className="w-full">Open appeal</ButtonLink></div>
            )}
            {c.status === "REJECTED_BY_REVIEWER" && <p className="mt-3 text-[13px] text-ink-2">Rejected by a reviewer. Re-run the copilot from the workspace to start over.</p>}
          </Card>

          <Card className="p-5">
            <div className="flex items-center">
              <Caption>Audit trail</Caption>
              <span className="ml-auto text-[11.5px] text-ink-3">append-only</span>
            </div>
            <div className="mt-2"><AuditList entries={view.audit} limit={6} /></div>
            <Link href="/audit" className="mt-2 inline-block text-[12.5px] text-accent hover:underline">Full audit log</Link>
          </Card>
        </aside>
      </div>

      <Dialog
        open={decision !== null}
        onOpenChange={(o) => !o && setDecision(null)}
        title={decision === "reject" ? "Reject this packet?" : "Request changes"}
        description={decision === "reject" ? "The case is closed as rejected. You can re-run the copilot later." : "The case goes back to the team with your comment."}
      >
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-2">Comment (saved in the audit log)</span>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDecision(null)}>Cancel</Button>
          <Button
            variant={decision === "reject" ? "danger" : "primary"}
            loading={decide.isPending}
            onClick={() => decide.mutate({ decision: decision!, comment }, {
              onSuccess: () => { toast.success(decision === "reject" ? "Packet rejected" : "Changes requested"); setDecision(null); setComment(""); },
              onError: (e) => toast.error(e.message),
            })}
          >
            {decision === "reject" ? "Reject packet" : "Send back"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
