"use client";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Cog, User } from "lucide-react";
import Link from "next/link";
import type { AuditEntry } from "@/lib/types";
import { clock, formatDate } from "@/lib/utils";

const ICON = { ai: Bot, human: User, system: Cog };

export function AuditList({ entries, showCase, limit }: { entries: AuditEntry[]; showCase?: boolean; limit?: number }) {
  const list = limit ? entries.slice(0, limit) : entries;
  return (
    <ol className="font-mono text-[12px] leading-[18px]">
      <AnimatePresence initial={false}>
        {list.map((e) => {
          const Icon = ICON[e.actor_type];
          return (
            <motion.li
              key={e._id}
              layout
              initial={{ opacity: 0, y: -6, backgroundColor: "rgba(228,239,236,1)" }}
              animate={{ opacity: 1, y: 0, backgroundColor: "rgba(228,239,236,0)" }}
              transition={{ duration: 0.32, backgroundColor: { duration: 1.4 } }}
              className="flex items-start gap-2.5 rounded-[6px] border-b border-line px-1 py-2 last:border-b-0"
            >
              <Icon className={e.actor_type === "human" ? "mt-px size-3.5 shrink-0 text-accent" : "mt-px size-3.5 shrink-0 text-ink-3"} strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-x-2">
                  <span className="text-ink-3" title={formatDate(e.created_at)}>{clock(e.created_at)}</span>
                  <span className="font-medium text-ink">{e.action}</span>
                  {showCase && e.case_id && (
                    <Link href={`/cases/${e.case_id}`} className="text-accent hover:underline">{e.case_id}</Link>
                  )}
                </div>
                <div className="truncate text-ink-3">{e.actor_type} · {e.actor}</div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
