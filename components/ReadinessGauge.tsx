"use client";
import { motion } from "motion/react";
import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { CountUp } from "./CountUp";
import { readinessTone } from "./ui/status";
import { useMeta } from "@/lib/client";
import type { Readiness } from "@/lib/types";
import { cn } from "@/lib/utils";

const ARC = "M 16 100 A 84 84 0 0 1 184 100";

/** 180-degree readiness arc. Animates to the new value; the number counts up. */
export function ReadinessGauge({ readiness, size = "lg" }: { readiness: Readiness | null; size?: "lg" | "sm" }) {
  const score = readiness?.score ?? 0;
  const tone = readinessTone(readiness?.score);
  const meta = useMeta();
  if (size === "sm") {
    return (
      <div className="flex items-center gap-2" title="Readiness score">
        <svg viewBox="0 0 200 108" className="h-6 w-11" aria-hidden>
          <path d={ARC} fill="none" stroke="var(--surface-sunken)" strokeWidth="18" strokeLinecap="round" />
          <motion.path d={ARC} fill="none" stroke={tone.bar} strokeWidth="18" strokeLinecap="round" initial={false} animate={{ pathLength: score / 100 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
        </svg>
        <div className="leading-none">
          <CountUp value={score} className={cn("text-[18px] font-semibold", tone.text)} />
          <div className="mt-0.5 text-[11px] text-ink-3">Readiness</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[220px]">
        <svg viewBox="0 0 200 112" className="w-full" role="img" aria-label={`Readiness score ${score} out of 100`}>
          <path d={ARC} fill="none" stroke="var(--surface-sunken)" strokeWidth="12" strokeLinecap="round" />
          <motion.path d={ARC} fill="none" stroke={tone.bar} strokeWidth="12" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: readiness ? score / 100 : 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
        </svg>
        <div className="absolute inset-x-0 bottom-1 text-center">
          {readiness ? <CountUp value={score} className={cn("text-[32px] leading-9 font-semibold", tone.text)} /> : <span className="text-[32px] leading-9 font-semibold text-ink-3">-</span>}
          <div className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">Readiness</div>
        </div>
      </div>
      <motion.p
        initial={false}
        animate={{ opacity: readiness?.capped ? 1 : 0, height: readiness?.capped ? "auto" : 0 }}
        className="mt-2 overflow-hidden text-center text-[12px] text-missing"
      >
        Capped at 60: a required criterion is missing
      </motion.p>
      <Popover.Root>
        <Popover.Trigger className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
          <Info className="size-3.5" strokeWidth={1.75} /> How this is scored
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={8} className="z-50 w-[320px] rounded-[10px] border border-line bg-surface p-4 text-[13px] shadow-pop">
            <div className="mb-2 font-semibold">Transparent checklist score</div>
            <ul className="space-y-1 font-mono text-[12px] leading-[18px] text-ink-2">
              {(meta.data?.readiness_formula ?? []).map((l) => <li key={l}>{l}</li>)}
            </ul>
            <p className="mt-3 text-[12px] text-ink-3">This is not an approval probability. With real approval and denial history it could be replaced by a trained model.</p>
            {readiness && <p className="mt-2 text-[12px] text-ink-3">This case: {readiness.met_weight} of {readiness.total_weight} weighted points.</p>}
            <Popover.Arrow className="fill-surface" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
