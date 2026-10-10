"use client";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, CircleDashed, CircleHelp, CircleX, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dur, ease } from "@/lib/motion";
import type { CaseStatus, CriterionStatus } from "@/lib/types";

type Tone = "met" | "missing" | "unclear" | "neutral" | "running" | "accent" | "missing-outline";

const tones: Record<Tone, string> = {
  met: "text-met bg-met-bg border-met-line",
  missing: "text-missing bg-missing-bg border-missing-line",
  unclear: "text-unclear bg-unclear-bg border-unclear-line",
  neutral: "text-ink-2 bg-sunken border-line",
  running: "text-accent bg-accent-soft border-accent-line",
  accent: "text-accent bg-accent-soft border-accent-line",
  "missing-outline": "text-missing bg-surface border-missing-line",
};

export function Pill({ tone, icon: Icon, children, className, spin }: { tone: Tone; icon?: LucideIcon; children: React.ReactNode; className?: string; spin?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {Icon && <Icon className={cn("size-3.5", spin && "animate-spin")} strokeWidth={2} />}
      {children}
    </span>
  );
}

const CRITERION: Record<CriterionStatus | "NA", { tone: Tone; icon: LucideIcon; label: string }> = {
  MET: { tone: "met", icon: CircleCheck, label: "Met" },
  MISSING: { tone: "missing", icon: CircleX, label: "Missing" },
  UNCLEAR: { tone: "unclear", icon: CircleHelp, label: "Unclear" },
  NA: { tone: "neutral", icon: CircleDashed, label: "N/A" },
};

/** Criterion status pill. Icon + word + color, never color alone. Morphs when the status changes. */
export function StatusPill({ status, na }: { status: CriterionStatus; na?: boolean }) {
  const key = na ? "NA" : status;
  const s = CRITERION[key];
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={key}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: dur.slow, ease }}
        className="inline-flex"
      >
        <Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>
      </motion.span>
    </AnimatePresence>
  );
}

const CASE: Record<CaseStatus, { tone: Tone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  RUNNING: { tone: "running", label: "Running" },
  NEEDS_INFO: { tone: "missing", label: "Needs info" },
  READY_FOR_REVIEW: { tone: "accent", label: "Ready for review" },
  APPROVED_BY_HUMAN: { tone: "met", label: "Approved" },
  SUBMITTED: { tone: "met", label: "Submitted (mock)" },
  PAYER_APPROVED: { tone: "met", label: "Insurer approved" },
  DENIED: { tone: "missing-outline", label: "Denied" },
  APPEAL_DRAFTED: { tone: "unclear", label: "Appeal drafted" },
  REJECTED_BY_REVIEWER: { tone: "neutral", label: "Rejected" },
};

export function CaseStatusChip({ status }: { status: CaseStatus }) {
  const s = CASE[status];
  return (
    <Pill tone={s.tone} icon={status === "RUNNING" ? Loader2 : undefined} spin={status === "RUNNING"}>
      {s.label}
    </Pill>
  );
}

export const caseStatusLabel = (s: CaseStatus) => CASE[s].label;

export function readinessTone(score: number | null | undefined) {
  if (score == null) return { text: "text-ink-3", bar: "var(--line-strong)" };
  if (score >= 85) return { text: "text-met", bar: "var(--met)" };
  if (score >= 60) return { text: "text-unclear", bar: "#c48a1a" };
  return { text: "text-missing", bar: "var(--missing)" };
}

/** Mini readiness bar for tables (no filled background track). */
export function ReadinessBar({ score }: { score: number | null }) {
  const t = readinessTone(score);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score ?? 0}%`, background: t.bar }} />
        <span className="absolute inset-0 rounded-full border border-line" />
      </span>
      <span className={cn("tabular w-7 text-right text-[13px] font-medium", t.text)}>{score ?? "-"}</span>
    </span>
  );
}
