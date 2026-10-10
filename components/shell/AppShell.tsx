"use client";
import { FileCheck2, LayoutDashboard, ListChecks, Menu, ScrollText, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ROLES, useRole } from "@/components/providers";
import { Segmented } from "@/components/ui/misc";
import { useMeta } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/" },
  { href: "/cases", label: "Cases", icon: ListChecks, match: (p: string) => p.startsWith("/cases") },
  { href: "/audit", label: "Audit log", icon: ScrollText, match: (p: string) => p.startsWith("/audit") },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-[8px] bg-accent text-white shadow-xs">
        <FileCheck2 className="size-4" strokeWidth={1.75} />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">
        Prior Auth <span className="font-serif text-[17px] font-normal italic">Copilot</span>
      </span>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const meta = useMeta();
  return (
    <div className="flex h-full flex-col px-3 py-4">
      <div className="px-2 pb-6">
        <Logo />
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const active = n.match(path);
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              className={cn(
                "relative flex h-9 items-center gap-2.5 rounded-[8px] px-3 text-[14px] transition-colors",
                active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-[#ebe7df] hover:text-ink",
              )}
            >
              {active && <motion.span layoutId="nav-bar" className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-accent" />}
              <n.icon className="size-[18px]" strokeWidth={1.75} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 px-1">
        {meta.data && (
          <div className="rounded-[8px] border border-line bg-surface/60 px-3 py-2.5 text-[12px] leading-4 text-ink-3">
            <div className="font-medium text-ink-2">{meta.data.provider.label}</div>
            <div className="mt-0.5">Storage: {meta.data.provider.store === "mongodb" ? "MongoDB" : "Local JSON store"}</div>
          </div>
        )}
        <div className="rounded-[8px] border border-dashed border-line-strong px-3 py-2.5 text-[11px] leading-4 font-medium tracking-[0.04em] text-ink-3 uppercase">
          Synthetic data
          <br />
          Mock policies
        </div>
      </div>
    </div>
  );
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Dashboard"],
  [/^\/cases$/, "Cases"],
  [/^\/cases\/[^/]+\/packet$/, "Packet review"],
  [/^\/cases\/[^/]+\/appeal$/, "Appeal"],
  [/^\/cases\/[^/]+$/, "Case workspace"],
  [/^\/audit$/, "Audit log"],
];

function TopBar({ onMenu }: { onMenu: () => void }) {
  const path = usePathname();
  const { role, setRole } = useRole();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = document.getElementById("main-scroll");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { root: el, threshold: 1 });
    const sentinel = document.getElementById("scroll-sentinel");
    if (sentinel) io.observe(sentinel);
    return () => io.disconnect();
  }, [path]);
  const caseId = path.match(/^\/cases\/([^/]+)/)?.[1];
  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? "";
  return (
    <header className={cn("sticky top-0 z-30 flex h-14 items-center gap-3 px-4 transition-[background-color,box-shadow] duration-200 md:px-8", scrolled ? "bg-surface/95 shadow-sm backdrop-blur" : "bg-transparent")}>
      <button className="rounded-md p-1.5 text-ink-2 hover:bg-sunken lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="size-5" strokeWidth={1.75} />
      </button>
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-3">
        {caseId ? (
          <>
            <Link href="/cases" className="hover:text-ink">Cases</Link>
            <span>/</span>
            <Link href={`/cases/${caseId}`} className="font-mono text-[12.5px] hover:text-ink">{decodeURIComponent(caseId)}</Link>
            {title !== "Case workspace" && (<><span>/</span><span className="text-ink">{title}</span></>)}
          </>
        ) : (
          <span className="text-ink">{title}</span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-[12px] text-ink-3 sm:inline">Viewing as</span>
        <div className="hidden sm:block">
          <Segmented<Role> layoutId="role-switch" value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r.id, label: r.label }))} />
        </div>
        <select
          aria-label="Viewing as"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="h-8 rounded-[8px] border border-line bg-surface px-2 text-[13px] sm:hidden"
        >
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative z-[1] flex h-[100dvh] overflow-hidden">
      <aside className="hidden w-[232px] shrink-0 border-r border-line bg-sunken lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[rgba(29,28,26,0.24)]" onClick={() => setOpen(false)} />
          <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-y-0 left-0 w-[232px] border-r border-line bg-sunken shadow-pop">
            <button className="absolute top-4 right-3 rounded-md p-1 text-ink-3 hover:bg-[#ebe7df]" onClick={() => setOpen(false)} aria-label="Close navigation">
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </motion.aside>
        </div>
      )}
      <div id="main-scroll" className="scroll-quiet relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div id="scroll-sentinel" className="absolute top-0 h-2 w-px" />
        <TopBar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-2 pb-12 md:px-8">{children}</main>
      </div>
    </div>
  );
}
