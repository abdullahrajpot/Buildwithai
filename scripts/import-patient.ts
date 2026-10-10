// npm run import:patient -- <folder>     (no folder: imports every folder in data/real/)
// Adds (or updates) one patient and their chart notes without touching any other data.
//
// Folder layout:
//   patient.json        patient details (see data/real/_template/patient.json)
//   *.txt               one chart note per file, in the chart from the start
//   attach/*.txt        optional notes that are NOT in the chart yet; they appear in the
//                       "Attach document" dialog so you can close a gap during the demo
//
// Each .txt may start with header lines, then a blank line, then the note text:
//   Title: Physiotherapy discharge summary
//   Type: pt_note            (visit_note | pt_note | imaging_report | addendum | upload)
//   Date: 2026-09-25
//   Author: Physiotherapy department
import "./env";
import { importPatientFolder, realPatientFolders } from "../lib/importPatient";

async function main() {
  const folder = process.argv[2];
  const folders = folder ? [folder] : realPatientFolders();
  if (!folders.length) throw new Error("Usage: npm run import:patient -- <folder>   (or put folders in data/real/)");
  for (const f of folders) {
    const p = await importPatientFolder(f);
    console.log(`  Open the app, click "New case", pick ${p.label}, and run the copilot.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
