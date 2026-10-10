import fs from "node:fs";
import path from "node:path";
import { handle, ok } from "@/lib/api";
import { getStore } from "@/lib/db";
import { readEvalResults, providerInfo } from "@/lib/view";
import { READINESS_FORMULA } from "@/lib/agents/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  let sampleDenial = "";
  try {
    sampleDenial = fs.readFileSync(path.join(process.cwd(), "data", "rejection_letter_sample.txt"), "utf8");
  } catch { /* optional */ }
  return ok({
    provider: providerInfo(),
    seeded: (await getStore().count("patients")) > 0,
    eval: readEvalResults(),
    readiness_formula: READINESS_FORMULA,
    sample_denial: sampleDenial,
  });
});
