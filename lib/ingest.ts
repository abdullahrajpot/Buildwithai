// Policy ingestion: parse the policy Markdown -> one chunk per section -> embed with
// bge-small -> store in policy_chunks with { insurer, policy_id, procedure_code, section } metadata.
import fs from "node:fs";
import path from "node:path";
import { getStore } from "./db";
import { embedPassage, EMBED_MODEL } from "./embed";
import { parsePolicy } from "./policyParser";
import type { Insurer, Policy, PolicyChunk } from "./types";

export async function ingestPolicies(log: (m: string) => void = console.log) {
  const dir = path.join(process.cwd(), "data", "policies");
  const store = getStore();
  let embedded = 0;
  let total = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    if (file.startsWith("_")) continue; // templates and disabled files
    const { meta, sections } = parsePolicy(fs.readFileSync(path.join(dir, file), "utf8"));
    // A policy for an insurer the database does not know yet registers that insurer.
    if (!(await store.findOne<Insurer>("insurers", { _id: meta.insurer }))) {
      const m = meta as unknown as Record<string, string>;
      await store.insertOne<Insurer>("insurers", {
        _id: meta.insurer,
        name: m.insurer_name || meta.insurer,
        subtitle: m.insurer_subtitle || "imported policy",
        monogram: (m.insurer_name || meta.insurer).replace(/^insurer\s+/i, "").charAt(0).toUpperCase(),
      });
      log(`  Registered insurer ${meta.insurer}`);
    }
    const codes = [...new Set(sections.map((s) => s.meta.procedure).filter((c) => c && c !== "ALL"))];
    const policy: Policy = { _id: meta.policy_id, insurer: meta.insurer, name: meta.name, short: meta.short, procedure_codes: codes, version: meta.version, source_file: file };
    await store.replaceOne("policies", policy);
    for (const s of sections) {
      const text = s.text;
      const embedding = await embedPassage(`${s.title}. ${text}`);
      if (embedding) embedded++;
      total++;
      const chunk: PolicyChunk = {
        _id: `${meta.policy_id}#${s.section}`,
        policy_id: meta.policy_id,
        insurer: meta.insurer,
        procedure_code: s.meta.procedure ?? "ALL",
        section: s.section,
        title: s.title,
        tag: s.tag,
        meta: s.meta,
        text,
        embedding,
      };
      await store.replaceOne("policy_chunks", chunk);
    }
    log(`  ${file}: ${sections.length} sections (${meta.policy_id}, CPT ${codes.join(", ")})`);
  }
  log(embedded === total ? `  Embedded ${total} chunks with ${EMBED_MODEL}` : `  ${EMBED_MODEL} unavailable: ${total - embedded} of ${total} chunks stored without embeddings (lexical retrieval)`);
}
