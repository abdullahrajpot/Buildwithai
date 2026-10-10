"use client";
import { motion } from "motion/react";
import { ArrowRight, Database, FileSearch, History, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { useRole } from "@/components/providers";
import { Button, ButtonLink } from "@/components/ui/button";
import { Caption, Card, EmptyState, ErrorCard, Mono, Segmented, Skeleton } from "@/components/ui/misc";
import { CaseStatusChip, Pill } from "@/components/ui/status";
import { AgentTimeline } from "@/components/workspace/AgentTimeline";
import { ChartViewer, markKey, type EvidenceMark } from "@/components/workspace/ChartViewer";
import { ChecklistSkeleton, CriteriaChecklist } from "@/components/workspace/CriteriaChecklist";
import { GapPanel } from "@/components/workspace/GapPanel";
import { api, useCase, useCaseAction } from "@/lib/client";
import { cn } from "@/lib/utils";

type Tab = "chart" | "criteria" | "agent";

function Workspace() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { actor } = useRole();
  const { data: view, isLoading, error, refetch } = useCase(id);
  const fromId = search.get("from");
  const { data: prev } = useCase(fromId ?? undefined);
  // "Open in chart" from a citation chip: focus=<doc_id>:<start>:<end>
  const focusParts = search.get("focus")?.match(/^(.+):(\d+):(\d+)$/);
  const focus = focusParts ? markKey(focusParts[1], Number(focusParts[2])) : null;
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("criteria");
  const [switching, setSwitching] = useState(false);
  const runAction = useCaseAction(id, "/run");
  const cacheAction = useCaseAction(id, "/cache");

  const c = view?.case;
  const running = c?.status === "RUNNING";

  const marks: EvidenceMark[] = useMemo(() => {
    const m = new Map<string, EvidenceMark>();
    for (const r of c?.results ?? []) {
      for (const e of r.evidence) {
        const k = markKey(e.doc_id, e.char_start);
        const cur = m.get(k) ?? { doc_id: e.doc_id, start: e.char_start, end: e.char_end, criteria: [] };
        if (!cur.criteria.includes(r.criterion_id)) cur.criteria.push(r.criterion_id);
        m.set(k, cur);
      }
    }
    if (focusParts && !m.has(markKey(focusParts[1], Number(focusParts[2])))) {
      m.set(markKey(focusParts[1], Number(focusParts[2])), { doc_id: focusParts[1], start: Number(focusParts[2]), end: Number(focusParts[3]), criteria: ["cited"] });
    }
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.results, search]);

  const active = useMemo(() => {
    const keys = new Set<string>();
    if (selected) c?.results.find((r) => r.criterion_id === selected)?.evidence.forEach((e) => keys.add(markKey(e.doc_id, e.char_start)));
    else if (focus) keys.add(focus);
    return keys;
  }, [selected, focus, c?.results]);
  const scrollTo = active.size ? [...active][0] : null;

  // Insurer switch: rows whose status changed compared with the case we came from.
  const changed = useMemo(() => {
    const s = new Set<string>();
    if (!prev || !c || running || prev.case.patient_id !== c.patient_id) return s;
    for (const r of c.results) {
      const p = prev.case.results.find((x) => x.criterion_id === r.criterion_id);
      if (p && (p.status !== r.status || p.not_applicable !== r.not_applicable)) s.add(r.criterion_id);
    }
    return s;
  }, [prev, c, running]);

  if (error) return <div className="pt-6"><ErrorCard title="Could not load this case" message={(error as Error).message} actions={<Button size="sm" onClick={() => refetch()}>Retry</Button>} /></div>;
  if (isLoading || !view || !c) {
    return (
      <div className="pt-4">
        <Skeleton className="h-10 w-80" />
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
          <Skeleton className="h-[480px]" /><ChecklistSkeleton /><Skeleton className="h-[320px]" />
        </div>
      </div>
    );
  }

  const switchInsurer = async (insurer: string) => {
    setSwitching(true);
    try {
      const res = await api<{ id: string }>(`/api/cases/${id}/switch-insurer`, { method: "POST", json: { insurer, actor } });
      router.push(`/cases/${res.id}?from=${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setSwitching(false);
    }
  };

  const never = c.events.length === 0 && !running;
  const counts = { MET: 0, MISSING: 0, UNCLEAR: 0 };
  c.results.forEach((r) => { if (!r.not_applicable) counts[r.status]++; });
  const locked = ["APPROVED_BY_HUMAN", "SUBMITTED", "PAYER_APPROVED", "DENIED", "APPEAL_DRAFTED", "REJECTED_BY_REVIEWER"].includes(c.status);
  const colH = "min-w-0 xl:h-[calc(100dvh-196px)] xl:overflow-y-auto scroll-quiet";

  return (
    <div className="pt-2">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[20px] leading-7 font-medium">{c._id}</h1>
            <CaseStatusChip status={c.status} />
            {c.from_cache && <Pill tone="neutral" icon={History}>Cached run</Pill>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-2">
            <span className="font-medium text-ink">{view.patient?.label}</span>
            <span>{view.patient?.name_masked}, {view.patient?.age} {view.patient?.sex}</span>
            <span className="text-ink-3">|</span>
            <span>{view.procedure.name}</span>
            <Mono className="text-ink-3">CPT {c.procedure_code}</Mono>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Caption className="hidden md:block">Insurer</Caption>
          <Segmented layoutId="insurer-switch" value={c.insurer} disabled={switching || running} onChange={switchInsurer} options={view.insurers.map((i) => ({ value: i._id, label: i.name }))} />
          {switching && <Loader2 className="size-4 animate-spin text-ink-3" />}
        </div>
        <div className="flex items-center gap-4 sm:ml-auto">
          <ReadinessGauge readiness={c.readiness} size="sm" />
          <ButtonLink href={`/cases/${c._id}/packet`} variant="primary" icon={<ArrowRight className="size-4" />} className={cn(!view.packet && "pointer-events-none opacity-50")}>Open packet</ButtonLink>
        </div>
      </motion.div>

      {c.error && !running && (
        <div className="mb-4">
          <ErrorCard
            title="The pipeline stopped"
            message={c.error}
            actions={<>
              <Button size="sm" onClick={() => runAction.mutate({})} loading={runAction.isPending}>Retry</Button>
              {view.cache_available && <Button size="sm" onClick={() => cacheAction.mutate({}, { onSuccess: () => toast.success("Loaded the cached result for this case") })} loading={cacheAction.isPending} icon={<Database className="size-3.5" />}>Use cached result</Button>}
            </>}
          />
        </div>
      )}
      {locked && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 text-[13px] text-ink-2 shadow-xs">
          {c.status === "DENIED" || c.status === "APPEAL_DRAFTED" ? (
            <>The insurer denied this request (mock). <Link href={`/cases/${c._id}/appeal`} className="font-medium text-accent hover:underline">Open the appeal</Link></>
          ) : c.status === "REJECTED_BY_REVIEWER" ? (
            <>A reviewer rejected this packet. <button className="font-medium text-accent hover:underline" onClick={() => runAction.mutate({})}>Run the copilot again</button></>
          ) : (
            <>This packet was approved by a human and is locked. <Link href={`/cases/${c._id}/packet`} className="font-medium text-accent hover:underline">View packet</Link></>
          )}
        </div>
      )}

      {never ? (
        <Card>
          <EmptyState
            icon={FileSearch}
            title="The copilot has not read this chart yet."
            body="It will extract facts, retrieve the insurer's criteria, and check each one for verbatim evidence."
            action={<Button variant="primary" onClick={() => runAction.mutate({})} loading={runAction.isPending} icon={<Sparkles className="size-4" strokeWidth={1.75} />}>Run Copilot</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 xl:hidden">
            <Segmented<Tab> layoutId="ws-tabs" value={tab} onChange={setTab} options={[{ value: "chart", label: "Chart" }, { value: "criteria", label: "Criteria" }, { value: "agent", label: "Agent" }]} />
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
            <section className={cn(colH, "pr-1", tab !== "chart" && "hidden xl:block")} aria-label="Patient chart">
              <div className="sticky top-0 z-[2] bg-paper/95 pb-3 backdrop-blur"><Caption>Patient chart</Caption></div>
              <ChartViewer docs={view.docs} marks={marks} active={active} scrollTo={scrollTo} newSince={c.created_at} />
            </section>

            <section className={cn(colH, "pr-1", tab !== "criteria" && "hidden xl:block")} aria-label="Criteria checklist">
              <div className="sticky top-0 z-[2] flex flex-wrap items-center gap-2 bg-paper/95 pb-3 backdrop-blur">
                <Caption>Criteria vs evidence</Caption>
                {c.criteria.length > 0 && (
                  <div className="ml-auto flex gap-1.5">
                    <Pill tone="met">{counts.MET} Met</Pill>
                    <Pill tone="missing">{counts.MISSING} Missing</Pill>
                    <Pill tone="unclear">{counts.UNCLEAR} Unclear</Pill>
                  </div>
                )}
              </div>
              {view.policy && c.criteria.length > 0 && (
                <p className="mb-3 text-[12.5px] text-ink-3">
                  Retrieved from <span className="font-medium text-ink-2">{view.policy.name}</span> v{view.policy.version}. Click a criterion to light up its quote in the chart.
                </p>
              )}
              {c.criteria.length === 0 ? (
                <ChecklistSkeleton />
              ) : (
                <CriteriaChecklist criteria={c.criteria} results={c.results} docs={view.docs} selected={selected} onSelect={(cid) => { setSelected((s) => (s === cid ? null : cid)); }} changed={changed} />
              )}
            </section>

            <section className={cn(colH, "pr-1", tab !== "agent" && "hidden xl:block")} aria-label="Agent timeline">
              <div className="sticky top-0 z-[2] bg-paper/95 pb-3 backdrop-blur"><Caption>Agent timeline</Caption></div>
              <Card className="p-4">
                <AgentTimeline events={c.events} running={running} />
                <div className="mt-3 border-t border-line pt-3 text-[12px] text-ink-3">
                  {view.provider.label}
                  {c.grounding.returned > 0 && <> · <span className="tabular">{c.grounding.verified}/{c.grounding.returned}</span> quotes verified</>}
                </div>
              </Card>
              <div className="mt-5 pb-3"><Caption>Gaps before submission</Caption></div>
              {c.criteria.length ? <GapPanel view={view} /> : <Skeleton className="h-28" />}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <Workspace />
    </Suspense>
  );
}
