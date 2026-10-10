// Imports a real (de-identified) patient folder: patient.json + .txt chart notes. See scripts/import-patient.ts.
import fs from "node:fs";
import path from "node:path";
import { getStore } from "./db";
import { isKnownCpt, isKnownIcd } from "./codes";
import type { ChartDocument, DocType, Insurer, Patient } from "./types";

const TYPES: DocType[] = ["visit_note", "pt_note", "imaging_report", "addendum", "upload"];

export function readNote(file: string, patientId: string, attachable: boolean): ChartDocument {
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const headers: Record<string, string> = {};
  let body = raw;
  const lines = raw.split("\n");
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^(Title|Type|Date|Author):\s*(.*)$/i);
    if (!m) break;
    headers[m[1].toLowerCase()] = m[2].trim();
  }
  if (i > 0) body = lines.slice(i).join("\n");
  const text = body.trim();
  if (text.length < 20) throw new Error(`${file}: the note text is empty or too short`);
  const base = path.basename(file, ".txt");
  const type = (headers.type as DocType) || (/pt|physio/i.test(base) ? "pt_note" : /x-?ray|imaging|mri|radio/i.test(base) ? "imaging_report" : "visit_note");
  if (!TYPES.includes(type)) throw new Error(`${file}: Type must be one of ${TYPES.join(", ")}`);
  const docId = `${patientId.replace(/^PT-/, "")}-${base}`.replace(/[^A-Za-z0-9_-]/g, "_");
  return {
    _id: `${patientId}:${docId}`,
    patient_id: patientId,
    doc_id: docId,
    type,
    title: headers.title || base.replace(/[_-]+/g, " "),
    date: headers.date || new Date().toISOString().slice(0, 10),
    author: headers.author || "Imported",
    text,
    created_at: "2000-01-01T00:00:00.000Z", // predates every case, so it never shows as "Added"
    attachable,
  };
}

export async function importPatientFolder(folder: string, log: (m: string) => void = console.log) {
  if (!fs.existsSync(path.join(folder, "patient.json"))) throw new Error(`${folder}: patient.json not found`);
  const store = getStore();
  if ((await store.count("policies")) === 0) throw new Error('No policies in the database. Run "npm run seed" (or "npm run ingest") first.');

  const meta = JSON.parse(fs.readFileSync(path.join(folder, "patient.json"), "utf8")) as Partial<Patient>;
  const id = meta._id || `PT-${path.basename(path.resolve(folder)).toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
  const problems: string[] = [];
  if (!meta.procedure_code || !isKnownCpt(meta.procedure_code)) problems.push(`procedure_code "${meta.procedure_code}" is not in lib/codes.ts (CPT table)`);
  for (const c of meta.icd10_codes ?? []) if (!isKnownIcd(c)) problems.push(`ICD-10 "${c}" is not in lib/codes.ts (it will fail the verifier's code check)`);
  if (!meta.default_insurer || !(await store.findOne<Insurer>("insurers", { _id: meta.default_insurer }))) problems.push(`default_insurer "${meta.default_insurer}" is not a known insurer (add its policy to data/policies and run "npm run ingest")`);
  if (problems.length) throw new Error(`Fix patient.json:\n  - ${problems.join("\n  - ")}`);

  const patient: Patient = {
    _id: id,
    label: meta.label || id,
    mrn: meta.mrn || id,
    name_masked: meta.name_masked || "De-identified",
    initials: meta.initials || "DI",
    age: meta.age ?? 0,
    sex: meta.sex ?? "F",
    default_insurer: meta.default_insurer!,
    procedure_code: meta.procedure_code!,
    icd10_codes: meta.icd10_codes ?? [],
    provider: meta.provider ?? { name: "Ordering physician", id: "PRV-0000", facility: "Hospital" },
  };
  await store.replaceOne("patients", patient);

  const notes = fs.readdirSync(folder).filter((f) => f.endsWith(".txt")).map((f) => readNote(path.join(folder, f), id, false));
  const attachDir = path.join(folder, "attach");
  const extra = fs.existsSync(attachDir) ? fs.readdirSync(attachDir).filter((f) => f.endsWith(".txt")).map((f) => readNote(path.join(attachDir, f), id, true)) : [];
  if (!notes.length) throw new Error("No .txt chart notes found in the folder");
  for (const d of [...notes, ...extra]) await store.replaceOne("documents", d);

  log(`Imported ${patient.label} (${id}) with ${notes.length} chart notes${extra.length ? ` and ${extra.length} attachable notes` : ""}.`);
  return patient;
}

/** Every folder in data/real except templates (names starting with "_"). */
export function realPatientFolders() {
  const root = path.join(process.cwd(), "data", "real");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => path.join(root, d.name));
}
