# Prior Auth Copilot

AI that catches missing evidence **before** an insurance pre-approval request is submitted.
Team Ctrl+Alt+Defeat · Build With AI, AICON'26 · Health Operations.

A multi-step pipeline reads a patient's chart, retrieves the insurer's criteria (RAG), matches every
criterion to a **verbatim** chart quote (verified in code), flags gaps, drafts a cited Letter of Medical
Necessity, verifies it, scores readiness, and drafts an appeal if the request is denied. A human approves
every submission, and every AI output and human decision is written to an append-only audit log.

> Synthetic patients and mock insurer policies only. No real patient data. CPT/ICD codes are a demo subset.

Product spec: [PRIOR_AUTH_COPILOT_MVP.md](PRIOR_AUTH_COPILOT_MVP.md) · Design system: [design.md](design.md)

## Quick start

```bash
npm install
npm run setup      # seed (policies + embeddings + patients + demo queue + cache) and run the 6-case eval
npm run dev        # http://localhost:3000
```

No database, API key, or internet connection is required after the first `npm run setup`, which downloads the
bge-small embedding model (~35 MB) into `.cache/`. Without any configuration the app uses a local JSON
store (`.data/pac-db.json`) and the offline rules engine. Re-run `npm run seed` any time to reset the demo.

### Using Claude, Ollama, or MongoDB

Copy `.env.example` to `.env.local` and set what you need:

| Variable | Effect |
|---|---|
| `GROQ_API_KEY` (+ `LLM_PROVIDER=groq`) | Uses Groq (`GROQ_MODEL`, default `openai/gpt-oss-120b`) for every LLM step |
| `ANTHROPIC_API_KEY` | Uses Claude (`CLAUDE_MODEL`, default `claude-opus-5`) for extraction, policy normalization, matching, gap questions, letter writing, the audit pass, and appeals |
| `LLM_PROVIDER=ollama` | Uses a local open model (`OLLAMA_MODEL`, default `qwen2.5:7b-instruct`) through Ollama |
| `LLM_PROVIDER=rules` | Forces the deterministic offline engine |
| `MONGODB_URI` | Uses MongoDB (Atlas M0 or local) instead of the JSON store |

If an LLM call fails (no network, bad key, invalid JSON), that step falls back to the offline rules engine.
The timeline marks the step with a warning, and the LLM is skipped for 60 seconds so the demo never stalls.
Re-run `npm run seed` after changing the provider so the demo cache is built with it.

To test with Groq on real (de-identified) notes and a real insurer policy, follow
[TESTING_WITH_REAL_DATA.md](TESTING_WITH_REAL_DATA.md).

## Demo script (5 minutes)

1. **Queue** (`/cases`): **New case** → Patient B, MRI knee, Insurer A → **Run Copilot**. The agent timeline streams.
2. **Checklist**: C1 X-ray ✅, C2 conservative therapy ❌ "PT documented is 4 weeks. Policy needs 6."
   Click the row: the exact quote is highlighted in the chart.
3. **RAG moment**: switch the insurer to **Insurer B**. Same patient, rule is 4 weeks, checklist turns green.
   Changed rows pulse. No code changed, only the retrieved policy.
4. **Fix**: back on Insurer A, the physician clicks **Attach document** → updated PT note. Only C2 is
   re-checked, it turns ✅, readiness rises from 60 to 100.
5. **Packet** (`Open packet`): click a citation chip to see its source quote. Show the verifier checklist and
   the eval numbers, click **Approve**, and point at the new audit entry.
6. **Appeal**: open PA-1005 (denied) → **Use sample rejection letter** → **Draft appeal**: classified
   reason, counter-evidence, cited appeal letter for human review.

**Backup:** every case has **Use cached result** if a live run fails, and `npm run seed` restores the queue.

## How it works

```
intake → policy RAG → matcher → gap check → packet writer → verifier → readiness
```

| Step | Code | Guardrail |
|---|---|---|
| Intake | `lib/agents/intake.ts` | The model returns only `quote` + `doc_id`; `lib/evidenceValidator.ts` finds offsets, and unmatched quotes are dropped and counted |
| Policy RAG | `lib/agents/policy.ts`, `lib/ingest.ts` | Chunks filtered by insurer + CPT, ranked by cosine similarity (bge-small, local); criteria must cite a retrieved section |
| Matcher | `lib/agents/matcher.ts` | Quotes re-validated; a MET with no valid quote is downgraded to UNCLEAR |
| Gap check | `lib/agents/gapCloser.ts` | One question per required unmet criterion; human decisions survive re-runs |
| Writer | `lib/agents/writer.ts` | Sees only a numbered catalog of verified quotes; each clinical sentence must cite `[n]` |
| Verifier | `lib/agents/verifier.ts` | Code checks (citations resolve, sentences cited, criteria addressed, statuses consistent, identity, codes) plus an independent audit pass; one writer retry on FAIL |
| Readiness | `lib/agents/readiness.ts` | Transparent rule-based score (not an approval probability), capped at 60 if a required criterion is missing |
| Appeal | `lib/agents/appeal.ts` | Classifies the denial, reuses the matcher for counter-evidence, drafts a cited appeal |

The offline engine (`lib/rules.ts`) implements every step deterministically and reads thresholds from the
retrieved policy text, so the "different insurer, different result" effect still comes from retrieval.

## Evaluation

`npm run eval` runs the six labeled cases from the spec and writes `data/eval/results.json`, which the
dashboard and packet review display. It reports criteria match accuracy, evidence grounding rate, and gap
detection recall. Report the numbers for the provider you actually demo. The offline engine's 100% shows
the pipeline works on these six synthetic charts. It is not evidence of accuracy on real notes.

## Project structure

```
app/                  Next.js App Router: dashboard, cases, workspace, packet, appeal, audit, API routes
components/           UI (design.md tokens): workspace columns, letter + citation chips, gauge, timeline
lib/agents/           pipeline steps (plain async functions + Zod schemas)
lib/                  db (Mongo or JSON), llm (Claude/Ollama), embed (bge-small), rules, validator, pdf
data/                 synthetic patients, mock policies, rejection letter, eval cases
scripts/              seed, ingest-policies, eval
```

## Honest limits

Synthetic data and mock policies; rule-based readiness score; CPT/ICD demo subset; not validated on real
hospital data; submission and insurer decisions are mocks. This is administrative decision support. It
does not diagnose or order care.
