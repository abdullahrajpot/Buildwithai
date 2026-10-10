"use client";
import { motion, useReducedMotion } from "motion/react";
import { FileImage, FilePen, FileText, Stethoscope, Upload, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { ChartDocument, DocType } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export interface EvidenceMark {
  doc_id: string;
  start: number;
  end: number;
  criteria: string[];
}

export const markKey = (doc_id: string, start: number) => `${doc_id}:${start}`;

const ICONS: Record<DocType, LucideIcon> = {
  visit_note: Stethoscope,
  pt_note: FileText,
  imaging_report: FileImage,
  addendum: FilePen,
  upload: Upload,
};

/** Merge overlapping marks in one document so nested quotes render as one highlight. */
function mergeMarks(marks: EvidenceMark[]) {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const out: (EvidenceMark & { keys: string[] })[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && m.start < last.end) {
      last.end = Math.max(last.end, m.end);
      last.criteria = [...new Set([...last.criteria, ...m.criteria])];
      last.keys.push(markKey(m.doc_id, m.start));
    } else out.push({ ...m, keys: [markKey(m.doc_id, m.start)] });
  }
  return out;
}

function renderText(doc: ChartDocument, marks: EvidenceMark[], active: Set<string>) {
  const merged = mergeMarks(marks.filter((m) => m.doc_id === doc.doc_id));
  const nodes: ReactNode[] = [];
  let pos = 0;
  for (const m of merged) {
    if (m.start > pos) nodes.push(doc.text.slice(pos, m.start));
    const isActive = m.keys.some((k) => active.has(k));
    nodes.push(
      <span key={m.keys[0]} className="whitespace-normal">
        <span className="mr-1 inline-flex h-[18px] -translate-y-px items-center rounded-full border border-line bg-surface px-1.5 align-middle font-mono text-[10.5px] text-ink-3 not-italic">
          {m.criteria.join(" ")}
        </span>
        <mark id={`ev-${m.keys[0]}`} data-keys={m.keys.join(" ")} className="evidence" data-active={isActive}>
          {doc.text.slice(m.start, m.end)}
        </mark>
      </span>,
    );
    pos = m.end;
  }
  if (pos < doc.text.length) nodes.push(doc.text.slice(pos));
  return nodes;
}

export function ChartViewer({
  docs, marks, active, scrollTo, newSince,
}: { docs: ChartDocument[]; marks: EvidenceMark[]; active: Set<string>; scrollTo: string | null; newSince: string }) {
  const reduce = useReducedMotion();

  // Evidence link: bring the active quote to the middle of the chart column.
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.querySelector(`[data-keys~="${CSS.escape(scrollTo)}"]`);
    el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [scrollTo, reduce]);

  return (
    <div className="flex flex-col gap-4">
      {docs.map((d) => {
        const Icon = ICONS[d.type] ?? FileText;
        const isNew = d.created_at > newSince;
        return (
          <motion.article
            key={d.doc_id}
            layout="position"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[14px] border border-line bg-surface p-6 shadow-paper"
          >
            <header className="mb-3 flex items-start gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[14px] leading-5 font-semibold">{d.title}</h3>
                  {isNew && <span className="rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">Added</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-ink-3">
                  <span>{formatDate(d.date)}</span>
                  <span>{d.author}</span>
                  <span className="font-mono text-[11.5px]">{d.doc_id}</span>
                </div>
              </div>
            </header>
            <div className="font-serif text-[16px] leading-[28px] whitespace-pre-line text-ink">{renderText(d, marks, active)}</div>
          </motion.article>
        );
      })}
    </div>
  );
}
