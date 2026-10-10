import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** Wraps a route handler so unexpected errors return JSON instead of an HTML error page. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      return fail((e as Error).message || "Unexpected error", 500);
    }
  };
}

export type Params<K extends string> = { params: Promise<Record<K, string>> };

export const actorOf = (b: { actor?: string }) => (b.actor && b.actor.trim()) || "PA Coordinator (demo)";
