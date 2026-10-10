"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import type { Role } from "@/lib/types";

export const ROLES: { id: Role; label: string; actor: string; greeting: string }[] = [
  { id: "coordinator", label: "Coordinator", actor: "PA Coordinator (demo)", greeting: "Coordinator" },
  { id: "physician", label: "Physician", actor: "Ordering Physician (demo)", greeting: "Doctor" },
  { id: "manager", label: "Manager", actor: "Hospital Manager (demo)", greeting: "Manager" },
];

const RoleContext = createContext<{ role: Role; setRole: (r: Role) => void; actor: string; label: string; greeting: string }>({
  role: "coordinator",
  setRole: () => {},
  actor: ROLES[0].actor,
  label: ROLES[0].label,
  greeting: ROLES[0].greeting,
});

export const useRole = () => useContext(RoleContext);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } }));
  const [role, setRoleState] = useState<Role>("coordinator");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pac-role") as Role | null;
      if (saved && ROLES.some((r) => r.id === saved)) setRoleState(saved);
    } catch { /* storage unavailable: keep default */ }
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    try { localStorage.setItem("pac-role", r); } catch { /* ignore */ }
  };
  const meta = ROLES.find((r) => r.id === role)!;

  return (
    <QueryClientProvider client={client}>
      <RoleContext.Provider value={{ role, setRole, actor: meta.actor, label: meta.label, greeting: meta.greeting }}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)", boxShadow: "var(--shadow-pop)", fontFamily: "var(--font-sans)" },
          }}
        />
      </RoleContext.Provider>
    </QueryClientProvider>
  );
}
