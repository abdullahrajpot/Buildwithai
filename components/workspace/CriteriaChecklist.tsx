"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/misc";
import { StatusPill } from "@/components/ui/status";
import type { ChartDocument, Criterion, MatchResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const BAR: Record<string, string> = { MET: "bg-met", MISSING: "bg-missing", UNCLEAR: "bg-unclear", NA: "bg-line-strong" };

export function ChecklistSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-[10px] border border-line bg-surface p-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-3 h-12 w-full" />
        </div>
      ))}
    </div>
  );
}

export function CriteriaChecklist({
  criteria, results, docs, selected, onSelect, changed,
}: {
  criteria: Criterion[];
  results: MatchResult[];
  docs: ChartDocument[];
  selected: string | null;
  onSelect: (id: string) => void;
  changed: Set<string>;
}) {
  // Gap fixed: when a criterion turns MET, one soft sage glow passes over its row.
  const prev = useRef<Map<string, string>>(new Map());
  const [glow, setGlow] = useState<Set<string>>(new Set());
  useEffect(() => {
    const turned = new Set<string>();
    for (const r of results) {
      const before = prev.current.get(r.criterion_id);
      if (before && before !== "MET" && r.status === "MET") turned.add(r.criterion_id);
      prev.current.set(r.criterion_id, r.status);
    }
    if (turned.size) {
      setGlow(turned);
      const t = setTimeout(() => setGlow(new Set()), 800);
      return () => clearTimeout(t);
    }
  }, [results]);

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = criteria[Math.min(criteria.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
    document.getElementById(`crit-${next.id}`)?.focus();
  };

  return (
    <ul className="flex flex-col gap-3" aria-label="Criteria checklist">
      {criteria.map((c, idx) => {
        const r = results.find((x) => x.criterion_id === c.id);
        const statusKey = !r ? "UNCLEAR" : r.not_applicable ? "NA" : r.status;
        const isSel = selected === c.id;
        return (
          <motion.li key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}>
            <button
              id={`crit-${c.id}`}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => onKey(e, idx)}
              aria-pressed={isSel}
              className={cn(
                "relative w-full overflow-hidden rounded-[10px] border bg-surface py-4 pr-4 pl-5 text-left shadow-xs transition-[border-color,box-shadow,background-color] duration-[120ms]",
                isSel ? "border-accent bg-accent-soft/60 shadow-[0_0_0_3px_rgba(15,94,91,0.12)]" : "border-line hover:border-line-strong hover:shadow-sm",
                changed.has(c.id) && "changed-pulse",
                glow.has(c.id) && "met-glow",
              )}
            >
              <span className={cn("absolute inset-y-0 left-0 w-[3px] transition-colors duration-300", BAR[statusKey])} />
              <div className="flex flex-wrap items-center gap-2">
                {r ? <StatusPill status={r.status} na={r.not_applicable} /> : <StatusPill status="UNCLEAR" />}
                <span className="relative inline-flex h-5 overflow-hidden font-mono text-[12px] leading-5 text-ink-3">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={c.policy_ref} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
                      {c.id} · {c.policy_ref}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="ml-auto text-[12px] text-ink-3">{c.required ? "Required" : "Optional"}</span>
              </div>
              <div className="mt-2 text-[15px] leading-[22px] font-semibold">{c.title}</div>
              <div className="mt-0.5 text-[13px] leading-5 text-ink-2">{c.text}</div>
              {r && r.evidence.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {r.evidence.map((e) => (
                    <blockquote key={`${e.doc_id}:${e.char_start}`} className="rounded-r-[6px] border-l-[3px] border-highlight-edge bg-highlight-faint py-1.5 pr-3 pl-3 font-serif text-[15px] leading-6 text-ink italic">
                      &ldquo;{e.quote}&rdquo;
                      <span className="ml-2 font-mono text-[11.5px] text-ink-3 not-italic">{docs.find((d) => d.doc_id === e.doc_id)?.doc_id ?? e.doc_id}</span>
                    </blockquote>
                  ))}
                </div>
              )}
              {r && (
                <p className="mt-2 text-[13px] leading-5 text-ink-2">
                  {r.reasoning}
                  {r.decided_by === "human" && <span className="ml-1.5 text-[12px] text-ink-3">(human decision)</span>}
                </p>
              )}
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}
