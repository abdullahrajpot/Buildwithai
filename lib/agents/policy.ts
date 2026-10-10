// Step 2: Policy retrieval (RAG). Filters the insurer's policy chunks by payer and procedure,
// ranks them by cosine similarity with bge-small embeddings (lexical fallback), then turns the
// retrieved text into a normalized checklist. Criteria come from retrieved text, never from code,
// so a new insurer is a new document, not new logic.
import { getStore } from "../db";
import { cosine, embedQuery, lexicalScore } from "../embed";
import { structured } from "../llm";
import { procedureName } from "../codes";
import { rulesNormalizePolicy } from "../rules";
import { PolicyCriteriaSchema, type PolicyCriteriaOut } from "../schemas";
import type { Criterion, Policy, PolicyChunk, Provider } from "../types";
import { withFallback } from "./common";

const TOP_K = 6;

const SYSTEM = `You are the policy agent of a prior-authorization assistant.
You receive sections retrieved from an insurer's coverage policy. Convert the sections that state approval criteria
into a checklist. Use only the retrieved text. For each criterion give the section number exactly as shown,
a short title, a one-sentence requirement, whether it is required, the minimum weeks if a duration is stated,
the section number of any exception that waives it, and whether it is itself an exception.
Skip sections that are not criteria (scope, submission instructions).`;

export async function retrievePolicy(insurer: string, procedure: string, provider: Provider) {
  const store = getStore();
  const policies = await store.find<Policy>("policies", { insurer });
  const policy = policies.find((p) => p.procedure_codes.includes(procedure));
  if (!policy) throw new Error(`No policy found for ${insurer} and CPT ${procedure}. Run "npm run ingest".`);

  const candidates = (await store.find<PolicyChunk>("policy_chunks", { policy_id: policy._id })).filter(
    (c) => c.procedure_code === procedure || c.procedure_code === "ALL",
  );
  const query = `approval criteria for ${procedureName(procedure)} (CPT ${procedure}): required documentation, conservative therapy, imaging, exceptions`;
  const qVec = candidates.every((c) => c.embedding) ? await embedQuery(query) : null;
  const retrieval: "embedding" | "lexical" = qVec ? "embedding" : "lexical";
  const ranked = candidates
    .map((c) => ({ c, score: qVec ? cosine(qVec, c.embedding as number[]) : lexicalScore(query, `${c.title} ${c.text}`) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map((r) => r.c);

  const step = await withFallback<PolicyCriteriaOut>(
    provider,
    () =>
      structured(provider, {
        system: SYSTEM,
        prompt: ranked.map((c) => `<section number="${c.section}" title="${c.title}">\n${c.text}\n</section>`).join("\n\n"),
        schema: PolicyCriteriaSchema,
      }),
    () => rulesNormalizePolicy(ranked),
  );

  // Grounding check for policy output: every criterion must point at a retrieved criteria section.
  const retrievedSections = new Set(ranked.filter((c) => c.tag !== null).map((c) => c.section));
  const items = step.value.criteria
    .filter((c) => retrievedSections.has(c.section))
    .sort((a, b) => Number(a.section) - Number(b.section));
  const idBySection = new Map(items.map((c, i) => [c.section, `C${i + 1}`]));
  const criteria: Criterion[] = items.map((c) => ({
    id: idBySection.get(c.section)!,
    title: c.title,
    text: c.text,
    required: c.required,
    policy_ref: `${policy.short} §${c.section}`,
    section: c.section,
    min_weeks: c.min_weeks,
    waived_by: c.waived_by_section ? idBySection.get(c.waived_by_section) ?? null : null,
    is_exception: c.is_exception,
  }));
  return { policy, chunks: ranked, criteria, retrieval, used: step.used, warning: step.warning };
}
