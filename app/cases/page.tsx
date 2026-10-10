"use client";
import { motion } from "motion/react";
import { FileSearch, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { NewCaseDialog } from "@/components/NewCaseDialog";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorCard, Input, Mono, Select, Skeleton } from "@/components/ui/misc";
import { CaseStatusChip, ReadinessBar, caseStatusLabel } from "@/components/ui/status";
import { useCases } from "@/lib/client";
import { timeAgo } from "@/lib/utils";
import type { CaseStatus } from "@/lib/types";

export default function CasesPage() {
  const { data, isLoading, error, refetch } = useCases();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [insurer, setInsurer] = useState("");
  const [status, setStatus] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.cases ?? []).filter((c) => {
      if (insurer && c.insurer?._id !== insurer) return false;
      if (status && c.status !== status) return false;
      if (!term) return true;
      return [c.id, c.patient?.label, c.patient?.name_masked, c.patient?.mrn, c.procedure.name, c.procedure.code].some((s) => s?.toLowerCase().includes(term));
    });
  }, [data, q, insurer, status]);
  const statuses = [...new Set((data?.cases ?? []).map((c) => c.status))];

  return (
    <div className="pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">Case queue</h1>
          <p className="mt-1 text-[14px] text-ink-2">Every pre-authorization request, its readiness, and what it still needs.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)} disabled={!data} icon={<Plus className="size-4" strokeWidth={2} />}>New case</Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.75} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case, patient, MRN, procedure" className="w-full pl-9" aria-label="Search cases" />
        </div>
        <Select value={insurer} onChange={(e) => setInsurer(e.target.value)} aria-label="Filter by insurer">
          <option value="">All insurers</option>
          {data?.options.insurers.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{caseStatusLabel(s)}</option>)}
        </Select>
      </div>

      <Card className="mt-4 overflow-hidden">
        {error ? (
          <div className="p-5"><ErrorCard title="Could not load cases" message={(error as Error).message} actions={<Button size="sm" onClick={() => refetch()}>Retry</Button>} /></div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title={data?.cases.length ? "No cases match these filters." : "No cases yet."}
            body={data?.cases.length ? "Clear the search or filters to see every case." : "Start a case to let the copilot check the chart against the insurer's criteria."}
            action={!data?.cases.length && <Button variant="primary" onClick={() => setOpen(true)}>New case</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="bg-sunken text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">
                  <th className="px-5 py-2.5 font-medium">Case</th>
                  <th className="px-3 py-2.5 font-medium">Patient</th>
                  <th className="px-3 py-2.5 font-medium">Procedure</th>
                  <th className="px-3 py-2.5 font-medium">Insurer</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Readiness</th>
                  <th className="px-5 py-2.5 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, delay: Math.min(i, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    className="group relative h-[52px] border-b border-line last:border-b-0 hover:bg-paper"
                  >
                    <td className="relative px-5">
                      <span className="absolute inset-y-0 left-0 w-[2px] bg-line-strong opacity-0 transition-opacity group-hover:opacity-100" />
                      <Link href={`/cases/${c.id}`} className="font-mono text-[12.5px] text-ink after:absolute after:inset-0 after:content-['']">{c.id}</Link>
                    </td>
                    <td className="px-3">
                      <div className="text-[14px] font-medium">{c.patient?.label}</div>
                      <div className="text-[12px] text-ink-3">{c.patient?.name_masked}, {c.patient?.age} {c.patient?.sex}</div>
                    </td>
                    <td className="px-3">
                      <div className="text-[14px]">{c.procedure.name}</div>
                      <Mono className="text-ink-3">CPT {c.procedure.code}</Mono>
                    </td>
                    <td className="px-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="grid size-6 place-items-center rounded-full border border-line bg-sunken text-[11px] font-semibold text-ink-2">{c.insurer?.monogram}</span>
                        <span className="text-[14px]">{c.insurer?.name}</span>
                      </span>
                    </td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <CaseStatusChip status={c.status as CaseStatus} />
                        {c.open_gaps > 0 && <span className="text-[12px] text-ink-3">{c.open_gaps} gap{c.open_gaps > 1 ? "s" : ""}</span>}
                      </div>
                    </td>
                    <td className="px-3"><ReadinessBar score={c.readiness} /></td>
                    <td className="px-5 text-right text-[13px] text-ink-3">{timeAgo(c.updated_at)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data && <NewCaseDialog open={open} onOpenChange={setOpen} options={data.options} />}
    </div>
  );
}
