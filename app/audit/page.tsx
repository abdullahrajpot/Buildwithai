"use client";
import { Lock, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { AuditList } from "@/components/AuditList";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorCard, Select, Skeleton } from "@/components/ui/misc";
import { useAudit } from "@/lib/client";

export default function AuditPage() {
  const { data, isLoading, error, refetch } = useAudit();
  const [caseId, setCaseId] = useState("");
  const [actorType, setActorType] = useState("");
  const entries = useMemo(
    () => (data?.entries ?? []).filter((e) => (!caseId || e.case_id === caseId) && (!actorType || e.actor_type === actorType) && !e.case_id?.startsWith("CACHE-")),
    [data, caseId, actorType],
  );
  const caseIds = [...new Set((data?.entries ?? []).map((e) => e.case_id).filter((x): x is string => !!x && !x.startsWith("CACHE-")))].sort();

  return (
    <div className="pt-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[24px] leading-8 font-semibold tracking-[-0.01em]">Audit log <Lock className="size-4 text-ink-3" strokeWidth={1.75} /></h1>
          <p className="mt-1 text-[14px] text-ink-2">Every AI output and every human decision. Append-only: there is no update or delete path.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Select value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label="Filter by case">
            <option value="">All cases</option>
            {caseIds.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={actorType} onChange={(e) => setActorType(e.target.value)} aria-label="Filter by actor">
            <option value="">All actors</option>
            <option value="human">Human</option>
            <option value="ai">AI</option>
            <option value="system">System</option>
          </Select>
        </div>
      </div>
      <Card className="mt-6 p-4">
        {error ? (
          <ErrorCard title="Could not load the audit log" message={(error as Error).message} actions={<Button size="sm" onClick={() => refetch()}>Retry</Button>} />
        ) : isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : entries.length === 0 ? (
          <EmptyState icon={ScrollText} title="No entries yet." body="Actions on cases will appear here as they happen." />
        ) : (
          <AuditList entries={entries} showCase />
        )}
      </Card>
    </div>
  );
}
