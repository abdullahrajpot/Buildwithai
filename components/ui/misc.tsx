"use client";
import { motion } from "motion/react";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-[10px] border border-line bg-surface shadow-xs", className)} {...rest}>
      {children}
    </div>
  );
}

export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[12px] leading-4 font-medium tracking-[0.02em] text-ink-3 uppercase", className)}>{children}</div>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12.5px] leading-[18px]", className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

const control = "rounded-[6px] border border-line bg-surface px-3 text-[14px] text-ink shadow-xs transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_rgba(15,94,91,0.18)]";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "h-9 cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2 leading-[22px]", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-9", className)} {...props} />;
}

/** Empty state: serif one-liner, one action, minimal line icon. */
export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-6 py-14 text-center">
      <Icon className="mb-4 size-10 text-line-strong" strokeWidth={1.25} />
      <p className="font-serif text-[22px] leading-7 text-ink">{title}</p>
      {body && <p className="mt-2 max-w-[46ch] text-[14px] text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export function ErrorCard({ title, message, actions }: { title: string; message: string; actions?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-line border-l-[3px] border-l-missing bg-surface p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-missing" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-[13px] text-ink-2">{message}</p>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, layoutId, disabled,
}: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; layoutId: string; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-sunken p-0.5" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(o.value)}
            className={cn("relative h-7 rounded-[8px] px-3 text-[13px] font-medium transition-colors disabled:opacity-60", active ? "text-ink" : "text-ink-3 hover:text-ink-2")}
          >
            {active && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-[8px] border border-line bg-surface shadow-xs" transition={{ duration: 0.32, ease: [0.65, 0, 0.35, 1] }} />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function InlineRetry({ onRetry }: { onRetry: () => void }) {
  return <Button size="sm" onClick={onRetry}>Retry</Button>;
}
