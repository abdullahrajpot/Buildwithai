"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, X } from "lucide-react";
import type { PipelineEvent, Provider } from "@/lib/types";
import { cn } from "@/lib/utils";

const fmtMs = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

const PROVIDER_SHORT: Record<Provider, string> = { claude: "Claude", groq: "Groq", ollama: "Ollama", rules: "Rules" };

function Dot({ status }: { status: PipelineEvent["status"] }) {
  return (
    <span className="relative z-[1] grid size-5 place-items-center">
      {status === "running" && <span className="pulse-ring absolute inset-0 rounded-full bg-accent" />}
      <span
        className={cn(
          "relative grid size-5 place-items-center rounded-full border-2 transition-colors duration-300",
          status === "pending" && "border-line-strong bg-surface",
          status === "running" && "border-accent bg-accent",
          status === "done" && "border-accent bg-accent",
          status === "failed" && "border-missing bg-missing",
          status === "skipped" && "border-line bg-sunken",
        )}
      >
        {status === "done" && (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <motion.path d="M2.5 6.2 5 8.5 9.5 3.8" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} />
          </svg>
        )}
        {status === "failed" && <X className="size-3 text-white" strokeWidth={2.5} />}
      </span>
    </span>
  );
}

export function AgentTimeline({ events, running }: { events: PipelineEvent[]; running: boolean }) {
  const done = events.filter((e) => e.status === "done");
  const total = done.reduce((s, e) => s + (e.duration_ms ?? 0), 0);
  const complete = !running && events.length > 0 && events.every((e) => e.status === "done");
  return (
    <div>
      <ol className="relative">
        {events.map((e, i) => {
          const last = i === events.length - 1;
          return (
            <motion.li key={e.step} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: i * 0.03 }} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span className="absolute top-5 bottom-0 left-[9px] w-px bg-line">
                  <motion.span className="absolute inset-x-0 top-0 origin-top bg-accent" initial={false} animate={{ scaleY: e.status === "done" ? 1 : 0 }} style={{ height: "100%" }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} />
                </span>
              )}
              <Dot status={e.status} />
              <div className="min-w-0 flex-1 pt-px">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-[14px] font-medium", e.status === "pending" ? "text-ink-3" : "text-ink")}>{e.label}</span>
                  {e.provider && e.status === "done" && <span className="rounded-[4px] bg-sunken px-1 font-mono text-[10.5px] text-ink-3">{PROVIDER_SHORT[e.provider]}</span>}
                  {e.duration_ms != null && <span className="tabular ml-auto font-mono text-[12px] text-ink-3">{fmtMs(e.duration_ms)}</span>}
                </div>
                <AnimatePresence initial={false}>
                  {(e.summary || e.status === "running") && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={cn("text-[13px] leading-5", e.status === "failed" ? "text-missing" : "text-ink-3")}>
                      {e.status === "running" ? "Working..." : e.summary}
                    </motion.p>
                  )}
                </AnimatePresence>
                {e.warning && (
                  <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-4 text-unclear">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
                    {e.warning}
                  </p>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
      <AnimatePresence>
        {complete && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-[8px] border border-accent-line bg-accent-soft px-3 py-2 text-[12.5px] text-accent">
            Pipeline complete · {events.length} steps · <span className="tabular font-mono">{fmtMs(total)}</span> compute
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
