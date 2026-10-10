// npm run eval: runs the 6 labeled cases (spec section 11) through intake -> policy RAG -> matcher
// -> gap check, without touching the demo cases (policies must be ingested: run "npm run seed"), and prints:
//   criteria match accuracy, evidence grounding rate, gap detection recall.
// Results are written to data/eval/results.json and shown in the app (Packet Review, Dashboard).
import "./env";
import fs from "node:fs";
import path from "node:path";
import { getStore } from "../lib/db";
import { newStats } from "../lib/evidenceValidator";
import { configuredProvider, providerLabel } from "../lib/llm";
import type { ChartDocument, Patient } from "../lib/types";
import { readNote, realPatientFolders } from "../lib/importPatient";
import { runIntake } from "../lib/agents/intake";
import { retrievePolicy } from "../lib/agents/policy";
import { runMatcher } from "../lib/agents/matcher";
import { runGapCloser } from "../lib/agents/gapCloser";

// Charts come from the original data files (not the live database), so attaching documents during a
// demo never changes the evaluation.
function originalChart(patientId: string): ChartDocument[] {
  const dir = path.join(process.cwd(), "data", "patients");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (data.patient._id !== patientId) continue;
    return (data.documents as Omit<ChartDocument, "_id" | "patient_id" | "created_at">[]).map((d) => ({
      ...d, _id: `${patientId}:${d.doc_id}`, patient_id: patientId, created_at: "",
    }));
  }
  for (const folder of realPatientFolders()) {
    const meta = JSON.parse(fs.readFileSync(path.join(folder, "patient.json"), "utf8")) as Partial<Patient>;
    const id = meta._id || `PT-${path.basename(folder).toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
    if (id !== patientId) continue;
    return fs.readdirSync(folder).filter((f) => f.endsWith(".txt")).map((f) => readNote(path.join(folder, f), id, false));
  }
  throw new Error(`Patient ${patientId} not found in data/patients or data/real`);
}

interface EvalCase { id: number; patient_id: string; insurer: string; procedure_code: string; description: string; expected: Record<string, string> }

async function main() {
  if ((await getStore().count("patients")) === 0) throw new Error('No data. Run "npm run seed" first.');
  const provider = configuredProvider();
  // npm run eval -- data/eval/real_cases.json   scores your own labeled real cases instead
  const casesFile = process.argv[2] || path.join("data", "eval", "cases.json");
  const file = JSON.parse(fs.readFileSync(casesFile, "utf8")) as { cases: EvalCase[] };
  console.log(`Evaluating ${file.cases.length} cases with ${providerLabel(provider)}\n`);

  let correct = 0, total = 0, caught = 0, gapTotal = 0;
  const stats = newStats();
  const usedProviders = new Set<string>();
  for (const ec of file.cases) {
    const docs = originalChart(ec.patient_id);
    const intake = await runIntake(docs, provider, stats);
    const policy = await retrievePolicy(ec.insurer, ec.procedure_code, provider);
    const match = await runMatcher(policy.criteria, intake.facts, docs, provider, stats);
    const gaps = await runGapCloser(policy.criteria, match.results, intake.facts, ec.procedure_code, [], provider);
    [intake.used, policy.used, match.used, gaps.used].forEach((u) => usedProviders.add(u));

    const row: string[] = [];
    for (const [cid, expected] of Object.entries(ec.expected)) {
      const r = match.results.find((x) => x.criterion_id === cid);
      const got = !r ? "NONE" : r.not_applicable ? "NA" : r.status;
      total++;
      if (got === expected) correct++;
      if (expected === "MISSING" || expected === "UNCLEAR") {
        gapTotal++;
        if (gaps.gaps.some((g) => g.criterion_id === cid && g.status === "open")) caught++;
      }
      row.push(`${cid} ${got === expected ? "ok " : "XX "}${got.padEnd(7)}${got === expected ? "" : `(expected ${expected})`}`);
    }
    console.log(`Case ${ec.id} ${ec.description}\n  ${row.join("  ")}`);
  }

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
  console.log("\nResults");
  console.log(`  Criteria match accuracy : ${correct}/${total} (${pct(correct, total)})`);
  console.log(`  Evidence grounding rate : ${stats.verified}/${stats.returned} quotes verified (${pct(stats.verified, stats.returned)})`);
  console.log(`  Gap detection recall    : ${caught}/${gapTotal} (${pct(caught, gapTotal)})`);
  if (stats.dropped.length) console.log(`  Rejected quotes: ${stats.dropped.map((d) => `"${d.quote.slice(0, 50)}"`).join(", ")}`);

  const results = {
    ran_at: new Date().toISOString(),
    provider: [...usedProviders].map((p) => providerLabel(p as never)).join(" + "),
    cases: file.cases.length,
    criteria_accuracy: { correct, total },
    grounding: { verified: stats.verified, returned: stats.returned },
    gap_recall: { caught, total: gapTotal },
  };
  // Only the default synthetic set feeds the numbers shown in the app; real sets get their own file.
  const out = process.argv[2] ? casesFile.replace(/\.json$/, ".results.json") : path.join("data", "eval", "results.json");
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\nSaved ${out}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
