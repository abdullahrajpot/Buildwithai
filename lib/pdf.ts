// Packet PDF: form fields, the letter, and an appendix of cited source quotes.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Packet } from "./types";

// Standard PDF fonts only cover WinAnsi; replace anything else so generation never throws.
const safe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "*")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "*");

const INK = rgb(0.114, 0.11, 0.102);
const MUTED = rgb(0.478, 0.463, 0.427);
const ACCENT = rgb(0.059, 0.369, 0.357);

export async function packetPdf(packet: Packet, title: string) {
  const pdf = await PDFDocument.create();
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const margin = 56;
  let page: PDFPage = pdf.addPage([595, 842]);
  let y = 842 - margin;
  const width = 595 - margin * 2;

  const newPageIfNeeded = (h: number) => {
    if (y - h < margin) { page = pdf.addPage([595, 842]); y = 842 - margin; }
  };
  const wrap = (text: string, font: PDFFont, size: number, maxW: number) => {
    const lines: string[] = [];
    for (const para of safe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > maxW && line) { lines.push(line); line = word; }
        else line = next;
      }
      lines.push(line);
    }
    return lines;
  };
  const write = (text: string, font: PDFFont, size: number, color = INK, indent = 0, gap = 4) => {
    for (const line of wrap(text, font, size, width - indent)) {
      newPageIfNeeded(size + gap);
      page.drawText(line, { x: margin + indent, y: y - size, size, font, color });
      y -= size + gap;
    }
  };

  write("PRIOR AUTH COPILOT  |  SYNTHETIC DATA  |  MOCK POLICY", bold, 8, ACCENT);
  y -= 6;
  write(title, bold, 16);
  write(`Packet version ${packet.version}  |  Verifier ${packet.verifier_status}  |  ${packet.updated_at.slice(0, 10)}`, sans, 9, MUTED);
  y -= 10;

  write("Request form", bold, 11, ACCENT);
  const f = packet.form_json;
  const rows: [string, string][] = [
    ["Patient", `${f.patient_name_masked} (${f.age_sex})`],
    ["MRN", f.mrn],
    ["Insurer", f.insurer],
    ["Policy", f.policy_id],
    ["CPT", `${f.cpt_code} - ${f.cpt_description}`],
    ["ICD-10", f.icd10_codes.map((c) => `${c.code} ${c.description}`).join("; ")],
    ["Provider", `${f.provider_name} (${f.provider_id})`],
    ["Facility", f.facility],
    ["Request date", f.request_date],
  ];
  for (const [k, v] of rows) {
    newPageIfNeeded(14);
    page.drawText(safe(k), { x: margin, y: y - 9.5, size: 9.5, font: bold, color: MUTED });
    const lines = wrap(v, sans, 9.5, width - 90);
    lines.forEach((l, i) => page.drawText(l, { x: margin + 90, y: y - 9.5 - i * 13, size: 9.5, font: sans, color: INK }));
    y -= Math.max(1, lines.length) * 13 + 2;
  }
  y -= 12;

  write("Letter of Medical Necessity", bold, 11, ACCENT);
  y -= 4;
  for (const raw of packet.letter_md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { y -= 6; continue; }
    const h = line.match(/^##\s+(.+)/);
    if (h) { y -= 4; write(h[1], bold, 11); continue; }
    const isBullet = /^\s*[-*]\s+/.test(line);
    const text = line.replace(/^\s*[-*]\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1");
    write(isBullet ? `* ${text}` : text, /^\*\*/.test(line.trim()) ? bold : serif, 11, INK, isBullet ? 10 : 0, 5);
  }

  y -= 14;
  write("Appendix: cited source quotes (verified verbatim in the chart)", bold, 11, ACCENT);
  y -= 2;
  for (const c of packet.citations) {
    write(`[${c.n}] ${c.doc_title} (${c.doc_id})`, bold, 9.5, MUTED);
    write(`"${c.quote}"`, serifItalic, 10.5, INK, 12, 4);
    y -= 4;
  }
  return pdf.save();
}
