"use client";
// Client-side data hooks (TanStack Query). The workspace polls every second while the pipeline runs.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CaseRow, CaseView, EvalResults } from "./view";
import type { AuditEntry } from "./types";
import { useRole } from "@/components/providers";

export class ApiError extends Error {}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface CasesResponse {
  cases: CaseRow[];
  options: {
    patients: { id: string; label: string; name_masked: string; age: number; sex: string; procedure_code: string; default_insurer: string }[];
    insurers: { _id: string; name: string; subtitle: string; monogram: string }[];
    procedures: { code: string; name: string }[];
    provider: { configured: string; label: string; store: string };
  };
}

export interface AnalyticsResponse {
  kpis: {
    open_cases: number;
    total_cases: number;
    cases_with_gaps: number;
    open_gaps: number;
    avg_readiness: number | null;
    packets_drafted: number;
    est_minutes_saved: number;
    minutes_per_packet_assumption: number;
  };
  needs_attention: { id: string; patient: string; procedure: string; insurer: string; status: string; readiness: number | null; reason: string; target_role: string }[];
  gaps_by_reason: { reason: string; count: number }[];
  status_counts: Record<string, number>;
  grounding: { verified: number; returned: number };
  eval: EvalResults | null;
  provider: { configured: string; label: string; store: string };
}

export interface MetaResponse {
  provider: { configured: string; label: string; store: string };
  seeded: boolean;
  eval: EvalResults | null;
  readiness_formula: string[];
  sample_denial: string;
}

export const useCases = () => useQuery({ queryKey: ["cases"], queryFn: () => api<CasesResponse>("/api/cases") });
export const useAnalytics = () => useQuery({ queryKey: ["analytics"], queryFn: () => api<AnalyticsResponse>("/api/analytics") });
export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: () => api<MetaResponse>("/api/meta"), staleTime: 60_000 });
export const useAudit = (caseId?: string) =>
  useQuery({
    queryKey: ["audit", caseId ?? "all"],
    queryFn: () => api<{ entries: AuditEntry[] }>(`/api/audit${caseId ? `?case_id=${caseId}` : ""}`),
  });

export function useCase(id: string | undefined) {
  return useQuery({
    queryKey: ["case", id],
    queryFn: () => api<CaseView>(`/api/cases/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.case.status === "RUNNING" ? 1000 : false),
  });
}

/** POST helper that sends the current role as the actor and refreshes case data afterwards. */
export function useCaseAction<TBody extends object = Record<string, unknown>, TRes = unknown>(caseId: string | undefined, path: string) {
  const qc = useQueryClient();
  const { actor } = useRole();
  return useMutation({
    mutationFn: (b: TBody) => api<TRes>(`/api/cases/${caseId}${path}`, { method: "POST", json: { ...b, actor } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
