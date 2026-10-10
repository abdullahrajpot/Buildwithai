"use client";
import * as Popover from "@radix-ui/react-popover";
import { ArrowRight, Quote } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { Citation } from "@/lib/types";

function CitationChip({ n, citation, caseId }: { n: number; citation?: Citation; caseId: string }) {
  if (!citation) {
    return <span className="mx-0.5 inline-flex h-[18px] items-center rounded-[6px] border border-missing-line bg-missing-bg px-1 align-[1px] font-mono text-[11.5px] text-missing" title="This citation does not resolve to a verified quote">[{n}]</span>;
  }
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Citation ${n}: ${citation.doc_title}`}
        className="ml-1 inline-flex h-[18px] cursor-pointer items-center rounded-[6px] bg-accent-soft px-1 align-[1px] font-mono text-[11.5px] leading-none text-accent not-italic transition-colors hover:bg-accent hover:text-white focus-visible:shadow-[0_0_0_3px_rgba(15,94,91,0.18)]"
      >
        [{n}]
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} collisionPadding={16} className="z-50 w-[360px] max-w-[calc(100vw-32px)] rounded-[10px] border border-line bg-surface p-4 shadow-pop data-[state=open]:animate-[pop_200ms_var(--ease-out)]">
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <Quote className="size-3.5" strokeWidth={1.75} />
            <span className="font-medium text-ink-2">{citation.doc_title}</span>
            <span className="ml-auto font-mono">{citation.doc_id}</span>
          </div>
          <p className="mt-2 font-serif text-[15px] leading-6">
            <mark className="evidence" data-active="true">{citation.quote}</mark>
          </p>
          <p className="mt-2 text-[12px] text-ink-3">Verified verbatim in the chart by code, not by the model.</p>
          <Link href={`/cases/${caseId}?focus=${encodeURIComponent(`${citation.doc_id}:${citation.char_start}:${citation.char_end}`)}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
            Open in chart <ArrowRight className="size-3.5" />
          </Link>
          <Popover.Arrow className="fill-surface" />
          <style>{`@keyframes pop{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}`}</style>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function inline(text: string, citations: Citation[], caseId: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={i++} className="font-semibold">{inline(m[1], citations, caseId)}</strong>);
    else {
      const n = Number(m[2]);
      out.push(<CitationChip key={i++} n={n} citation={citations.find((c) => c.n === n)} caseId={caseId} />);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders the letter Markdown (headings, paragraphs, bullets, bold) with interactive citation chips. */
export function Letter({ md, citations, caseId }: { md: string; citations: Citation[]; caseId: string }) {
  const blocks: ReactNode[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length} className="mb-4">{para.map((l, i) => <Fragment key={i}>{i > 0 && (para[i - 1].endsWith("  ") || l.trim().startsWith("**") ? <br /> : " ")}{inline(l.trim(), citations, caseId)}</Fragment>)}</p>);
      para = [];
    }
    if (list.length) {
      blocks.push(<ul key={blocks.length} className="mb-4 list-disc space-y-1 pl-5 marker:text-ink-3">{list.map((l, i) => <li key={i}>{inline(l, citations, caseId)}</li>)}</ul>);
      list = [];
    }
  };
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.+)/);
    const b = line.match(/^\s*[-*]\s+(.+)/);
    if (h) { flush(); blocks.push(<h3 key={blocks.length} className="mt-6 mb-2 font-sans text-[13px] font-semibold tracking-[0.02em] text-ink-2 uppercase">{h[1]}</h3>); }
    else if (b) { if (para.length) flush(); list.push(b[1]); }
    else if (!line.trim()) flush();
    else { if (list.length) flush(); para.push(line); }
  }
  flush();
  return <div className="font-serif text-[16px] leading-[28px] text-ink">{blocks}</div>;
}
