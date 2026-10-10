// npm run seed: resets the database, ingests policies, loads synthetic patients and chart notes,
// pre-runs the demo queue, seeds one denied case for the appeal demo, and caches the Patient B runs
// so the stage demo still works if the network or API fails.
import "./env";
import fs from "node:fs";
import path from "node:path";
process.env.PIPELINE_STEP_DELAY_MS = "0";

import { appendAudit } from "../lib/audit";
import { getStore } from "../lib/db";
import { ingestPolicies } from "../lib/ingest";
import { importPatientFolder, realPatientFolders } from "../lib/importPatient";
import { configuredProvider, providerLabel } from "../lib/llm";
import { newCase, getCase, now, updateCase } from "../lib/repo";
import { runPipeline } from "../lib/agents/pipeline";
import type { ChartDocument, Insurer, Patient, Submission } from "../lib/types";

const SEED = "Seed script";

interface PatientFile {
  patient: Patient;
  documents: Omit<ChartDocument, "_id" | "patient_id" | "created_at">[];
  attachable_documents?: Omit<ChartDocument, "_id" | "patient_id" | "created_at">[];
}

async function createAndRun(id: string, patient: Patient, insurer: string) {
  const store = getStore();
  await store.insertOne("cases", newCase(id, { patient_id: patient._id, procedure_code: patient.procedure_code, insurer, icd10_codes: patient.icd10_codes }));
  await runPipeline(id, SEED);
  const c = await getCase(id);
  if (c?.error) throw new Error(`Pipeline failed for ${id}: ${c.error}`);
  console.log(`  ${id}  ${patient.label} / ${insurer}: ${c?.status}, readiness ${c?.readiness?.score ?? "-"}`);
  return c!;
}

async function main() {
  const store = getStore();
  console.log(`Seeding ${store.kind} store with provider: ${providerLabel(configuredProvider())}`);
  await store.resetAll();

  const insurers: Insurer[] = [
    { _id: "INS-A", name: "Insurer A", subtitle: "Northline Health, mock", monogram: "A" },
    { _id: "INS-B", name: "Insurer B", subtitle: "Sapphire Care, mock", monogram: "B" },
  ];
  for (const i of insurers) await store.insertOne("insurers", i);

  console.log("Policies:");
  await ingestPolicies();

  const dir = path.join(process.cwd(), "data", "patients");
  const patients: Record<string, Patient> = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as PatientFile;
    patients[data.patient._id] = data.patient;
    await store.insertOne("patients", data.patient);
    const docs = [...data.documents.map((d) => ({ ...d, attachable: false })), ...(data.attachable_documents ?? []).map((d) => ({ ...d, attachable: true }))];
    for (const d of docs) {
      await store.insertOne("documents", { ...d, _id: `${data.patient._id}:${d.doc_id}`, patient_id: data.patient._id, created_at: now() });
    }
  }
  console.log(`Patients: ${Object.keys(patients).length} synthetic patients loaded`);
  for (const folder of realPatientFolders()) {
    try { await importPatientFolder(folder, (m) => console.log(`  ${m}`)); }
    catch (e) { console.warn(`  Skipped ${folder}: ${(e as Error).message}`); }
  }

  console.log("Demo cache (Patient B, both insurers):");
  for (const [tmp, ins] of [["CACHE-B-A", "INS-A"], ["CACHE-B-B", "INS-B"]] as const) {
    await createAndRun(tmp, patients["PT-B"], ins);
    await store.deleteOne("cases", tmp);
    await store.deleteOne("packets", tmp);
  }

  console.log("Queue:");
  await createAndRun("PA-1001", patients["PT-A"], "INS-A");
  await createAndRun("PA-1002", patients["PT-C"], "INS-A");
  await createAndRun("PA-1003", patients["PT-D"], "INS-A");
  await createAndRun("PA-1004", patients["PT-E"], "INS-A");

  // Denied case for the appeal demo: approved by a human, submitted (mock), then denied by the insurer.
  const denied = await createAndRun("PA-1005", patients["PT-F"], "INS-A");
  if (denied.status !== "READY_FOR_REVIEW") throw new Error(`PA-1005 should be ready for review, got ${denied.status}`);
  const letter = fs.readFileSync(path.join(process.cwd(), "data", "rejection_letter_sample.txt"), "utf8");
  const sub: Submission = {
    _id: "PA-1005", case_id: "PA-1005", approved_by: "PA Coordinator (demo)", approved_at: "2026-08-24T09:12:00.000Z",
    mock_reference: "INS-A-PA-2026-08817", submitted_at: "2026-08-24T09:15:00.000Z", outcome: "denied",
    outcome_reason: "Insufficient documentation of conservative therapy.",
  };
  await store.insertOne("submissions", sub);
  await updateCase("PA-1005", { status: "DENIED" });
  await appendAudit({ case_id: "PA-1005", actor_type: "human", actor: "PA Coordinator (demo)", action: "PACKET_APPROVED", payload: { seeded: true } });
  await appendAudit({ case_id: "PA-1005", actor_type: "human", actor: "PA Coordinator (demo)", action: "SUBMITTED_MOCK", payload: { mock_reference: sub.mock_reference, seeded: true } });
  await appendAudit({ case_id: "PA-1005", actor_type: "system", actor: "Insurer A (mock)", action: "PAYER_DENIED_MOCK", payload: { reason: sub.outcome_reason, letter_chars: letter.length, seeded: true } });
  console.log("  PA-1005 marked DENIED (appeal demo)");

  console.log("\nDone. Start the app with: npm run dev");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
