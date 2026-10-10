"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({
  open, onOpenChange, title, description, children, className,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[rgba(29,28,26,0.24)] backdrop-blur-[2px] data-[state=open]:animate-[fade-in_200ms_var(--ease-out)]" />
        <D.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-line bg-surface p-6 shadow-pop focus:outline-none",
            "data-[state=open]:animate-[dialog-in_200ms_var(--ease-out)]",
            className,
          )}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <D.Title className="text-[18px] leading-[26px] font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-[13px] text-ink-3">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Close">
              <X className="size-4" strokeWidth={1.75} />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
      <style>{`@keyframes fade-in{from{opacity:0}to{opacity:1}}@keyframes dialog-in{from{opacity:0;transform:translate(-50%,-50%) scale(.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </D.Root>
  );
}
