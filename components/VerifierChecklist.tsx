"use client";
import { motion } from "motion/react";
import { CircleCheck, CircleX, ShieldCheck } from "lucide-react";
import type { VerifierCheck } from "@/lib/types";
import { Pill } from "./ui/status";

export function VerifierChecklist({ checks, status }: { checks: VerifierCheck[]; status: "PASS" | "FAIL" }) {
  const code = checks.filter((c) => c.layer === "code");
  const audit = checks.filter((c) => c.layer === "llm");
  const Row = ({ c, i }: { c: VerifierCheck; i: number }) => (
    <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.32 }} className="flex gap-2.5 py-1.5">
      {c.passed ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-met" strokeWidth={1.75} /> : <CircleX className="mt-0.5 size-4 shrink-0 text-missing" strokeWidth={1.75} />}
      <div className="min-w-0">
        <div className="text-[13px] leading-5 text-ink">{c.label}</div>
        {c.detail && <div className="text-[12px] leading-4 text-ink-3">{c.detail}</div>}
      </div>
    </motion.li>
  );
  return (
    <div>
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-accent" strokeWidth={1.75} />
        <h3 className="text-[15px] font-semibold">Verifier</h3>
        <span className="ml-auto">{status === "PASS" ? <Pill tone="met" icon={CircleCheck}>Pass</Pill> : <Pill tone="missing" icon={CircleX}>Fail</Pill>}</span>
      </div>
      <div className="mt-3 text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">Code checks</div>
      <ul>{code.map((c, i) => <Row key={c.id} c={c} i={i} />)}</ul>
      <div className="mt-2 text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">Second pass</div>
      <ul>{audit.map((c, i) => <Row key={c.id} c={c} i={i + code.length} />)}</ul>
    </div>
  );
}
