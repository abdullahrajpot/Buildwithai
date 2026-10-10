"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Database, ShieldCheck, Stethoscope } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountUp } from "@/components/CountUp";
import { useRole } from "@/components/providers";
import { Caption, Card, EmptyState, ErrorCard, Mono, Skeleton } from "@/components/ui/misc";
import { CaseStatusChip, ReadinessBar } from "@/components/ui/status";
import { useAnalytics, useMeta } from "@/lib/client";
import { fadeUp, stagger } from "@/lib/motion";
import type { CaseStatus } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Kpi({ label, value, suffix, note, est }: { label: string; value: number | null; suffix?: string; note: string; est?: string }) {
  return (
    <motion.div variants={fadeUp}>
      <Card className="h-full p-5 transition-[border-color,box-shadow] duration-[120ms] hover:border-line-strong hover:shadow-sm">
        <div className="flex items-center justify-between">
          <Caption>{label}</Caption>
          {est && <span title={est} className="cursor-help rounded-[6px] border border-line px-1.5 font-mono text-[11px] text-ink-3">est.</span>}
        </div>
        <div className="mt-2 text-[32px] leading-9 font-semibold">
          {value == null ? "-" : <CountUp value={value} />}
          {suffix && value != null && <span className="ml-1 text-[16px] font-medium text-ink-3">{suffix}</span>}
        </div>
        <div className="mt-1 text-[13px] text-ink-3">{note}</div>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useAnalytics();
  const meta = useMeta();
  const { greeting: who, role } = useRole();

  if (meta.data && !meta.data.seeded) {
    return (
      <Card className="mt-6">
        <EmptyState icon={Database} title="No demo data yet." body='Run "npm run seed" in the project folder, then reload this page.' />
      </Card>
    );
  }
  if (error) return <div className="mt-6"><ErrorCard title="Could not load the dashboard" message={(error as Error).message} actions={<button className="text-accent" onClick={() => refetch()}>Retry</button>} /></div>;

  const attention = (data?.needs_attention ?? []).filter((a) => role !== "physician" || a.target_role === "physician" || a.status === "DENIED");
  const k = data?.kpis;
  const gr = data?.grounding;
  return (
    <div className="pt-4">
      <motion.div {...fadeUp}>
        <h1 className="font-serif text-[40px] leading-[44px] font-medium tracking-[-0.02em]">
          {greeting()}, {who}
        </h1>
        <p className="mt-2 text-[14px] text-ink-2">
          {isLoading ? "Loading cases..." : attention.length ? `${attention.length} ${attention.length === 1 ? "case needs" : "cases need"} attention before submission.` : "Nothing needs your attention right now."}
        </p>
      </motion.div>

      {isLoading || !k ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px]" />)}
        </div>
      ) : (
        <motion.div variants={stagger} initial="initial" animate="animate" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Open cases" value={k.open_cases} note={`${k.total_cases} cases in total`} />
          <Kpi label="Cases with gaps" value={k.cases_with_gaps} note={`${k.open_gaps} open ${k.open_gaps === 1 ? "gap needs" : "gaps need"} input`} />
          <Kpi label="Avg readiness" value={k.avg_readiness} note="Transparent checklist score" />
          <Kpi
            label="Minutes saved"
            value={k.est_minutes_saved}
            suffix="min"
            note={`${k.packets_drafted} packets drafted`}
            est={`Estimate only: assumes ${k.minutes_per_packet_assumption} minutes of manual work per packet. Not measured; to be validated in a pilot.`}
          />
        </motion.div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[18px] leading-[26px] font-semibold">Needs attention</h2>
            <Link href="/cases" className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline">All cases <ArrowRight className="size-3.5" /></Link>
          </div>
          {isLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : attention.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="All clear." body="No case is waiting on a gap, a review, or an appeal." />
          ) : (
            <motion.ul variants={stagger} initial="initial" animate="animate">
              {attention.map((a) => (
                <motion.li key={a.id} variants={fadeUp} className="border-b border-line last:border-b-0">
                  <Link href={a.status === "DENIED" || a.status === "APPEAL_DRAFTED" ? `/cases/${a.id}/appeal` : a.status === "READY_FOR_REVIEW" ? `/cases/${a.id}/packet` : `/cases/${a.id}`} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-paper">
                    <Mono className="w-16 shrink-0 text-ink-2">{a.id}</Mono>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-[14px]">
                        <span className="font-medium">{a.procedure}</span>
                        <span className="text-ink-3">{a.insurer}</span>
                        <span className="text-ink-3">{a.patient}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-ink-2">
                        {a.target_role === "physician" && <Stethoscope className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />}
                        <span className="truncate">{a.reason}</span>
                      </div>
                    </div>
                    <div className="hidden sm:block"><ReadinessBar score={a.readiness} /></div>
                    <CaseStatusChip status={a.status as CaseStatus} />
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h2 className="text-[18px] leading-[26px] font-semibold">Open gaps by reason</h2>
            <p className="text-[13px] text-ink-3">What is most often missing before submission</p>
            <div className="mt-4 h-[180px]">
              {data && data.gaps_by_reason.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.gaps_by_reason} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--ink-3)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="reason" width={130} tick={{ fill: "var(--ink-2)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "var(--surface-sunken)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", boxShadow: "var(--shadow-pop)", fontSize: 13 }} />
                    <Bar dataKey="count" name="Open gaps" fill="var(--accent)" radius={[0, 6, 6, 0]} barSize={14} animationDuration={600} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-[13px] text-ink-3">{isLoading ? <Skeleton className="h-full w-full" /> : "No open gaps"}</div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-accent" strokeWidth={1.75} />
              <h2 className="text-[15px] leading-[22px] font-semibold">Evidence grounding</h2>
            </div>
            {gr && gr.returned > 0 ? (
              <p className="mt-2 text-[13px] text-ink-2">
                <span className="tabular font-semibold text-ink">{gr.verified} of {gr.returned}</span> quotes returned by the agents were found verbatim in the chart. Unverifiable quotes are rejected by code.
              </p>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">Runs will report how many quotes were verified.</p>
            )}
            {data?.eval && (
              <div className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-2">
                <div className="font-medium text-ink">Eval on {data.eval.cases} labeled cases</div>
                <div className="tabular mt-1 grid grid-cols-3 gap-2 font-mono text-[12px]">
                  <span>acc {data.eval.criteria_accuracy.correct}/{data.eval.criteria_accuracy.total}</span>
                  <span>ground {data.eval.grounding.verified}/{data.eval.grounding.returned}</span>
                  <span>recall {data.eval.gap_recall.caught}/{data.eval.gap_recall.total}</span>
                </div>
                <div className="mt-1 text-[12px] text-ink-3">{data.eval.provider}</div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
