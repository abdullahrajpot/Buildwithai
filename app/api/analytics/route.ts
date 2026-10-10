import { handle, ok } from "@/lib/api";
import { analytics } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => ok(await analytics()));
