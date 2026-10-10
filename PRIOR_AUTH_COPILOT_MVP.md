# Prior Auth Copilot (12-Hour MVP Spec)
### AI that catches missing evidence *before* an insurance pre-approval request is submitted

**Team:** Ctrl+Alt+Defeat | **Event:** Build With AI, AICON'26 | **Domain:** Health Operations
**Slot:** 11 Oct 2026, 10:52-10:57 AM, SEECS Lecture Hall (5 minutes)

> **One-liner:** A multi-step AI pipeline reads a patient's chart, retrieves the insurer's approval criteria, matches each criterion to *verbatim* chart evidence, flags gaps before submission, drafts a cited approval packet, and drafts an appeal if the request is denied. A human approves every submission.

---

## 0. What changed from the old doc (read this first)

| Old doc | This MVP spec | Why |
|---|---|---|
| 48-hour plan, 10+ pages | **12-hour plan, 4 core screens** | You have 12 hours |
| FastAPI + LangGraph + Celery + Redis + Postgres | **Next.js only (API routes) + MongoDB** | One repo, one language, nothing to wire between services |
| XGBoost denial predictor trained on rules you wrote ("AUC > 0.85") | **Rule-based Readiness Score**, ML on the roadmap | Training on your own synthetic rules is circular, and judges can see through it |
| LLM returns character offsets | **LLM returns only the quote; code finds the offsets** | LLMs can't count characters reliably |
| Immutable audit log | **Append-only** audit log | A normal collection is append-only by convention, not immutable |
| Unsourced stats (30-45 min, 90%+) | **Marked "estimated"; only measured numbers shown** | Judges ask "where is this from?" |
| US-only framing | **Local framing + US demo data, stated honestly** | Your judges are in Pakistan |
| 20 eval cases | **6 labeled eval cases** | Realistic for 12 hours |

---

## 1. Problem

Before a costly test or procedure (e.g., a knee MRI), the insurer often requires **pre-authorization (PA)**. Hospital staff must:

1. Read the patient's chart.
2. Find the insurer's rules for that procedure.
3. Collect proof that each rule is satisfied.
4. Write a Letter of Medical Necessity and fill in a form.
5. Submit, wait, and if one piece of proof is missing, the request is rejected and the cycle restarts.

**Core insight:** most rejections are *documentation gaps*, not unnecessary care. The proof often exists in the chart, or can be added, but nobody catches the gap before submission.

**Framing for the pitch (use this exact structure):**
- Globally, PA is a well-known administrative bottleneck (the US is where it is most studied).
- In Pakistan, private and corporate health insurers also require pre-approval at panel hospitals for admissions and expensive procedures, and the same chart-to-criteria-to-letter work is done manually.
- Our demo uses **synthetic patients and mock insurer policies**, modeled on publicly documented criteria, so no real patient data is involved.

> Do not quote statistics (minutes per request, denial rates) unless you have a source on the slide. If you use the "about 45 minutes" figure, say **"estimated"**.

---

## 2. Solution overview

Prior Auth Copilot is a **dashboard-style web app** (not a chatbot). Staff pick a case, the pipeline runs, and they see a **criteria vs. evidence** checklist where every ✅/❌/⚠️ links to an exact quote in the chart.

| Step | What the system does | Human involved? |
|---|---|---|
| 1. Intake | Extracts structured facts from notes, each with a verbatim quote | No |
| 2. Policy retrieval (RAG) | Retrieves the insurer's criteria for this procedure | No |
| 3. Criteria matching | Marks each criterion MET / MISSING / UNCLEAR with evidence | No |
| 4. Gap-closing | Turns gaps into one specific question for the doctor | **Yes** (answers) |
| 5. Packet writing | Drafts the cited Letter of Medical Necessity + form fields | No |
| 6. Verification | Code checks citations; a second LLM pass audits the packet | No |
| 7. Readiness score | Rule-based score and fixes | No |
| 8. Human review | Edit, approve, or reject; everything is logged | **Yes** |
| 9. Appeal (mock) | Reads a rejection letter, drafts an appeal | **Yes** (reviews) |

**Differentiators (say these out loud in the pitch):**
1. **Gaps caught before submission**, not just paperwork automation.
2. **Verifiable citations**: every clinical claim maps to a verbatim chart quote, enforced in code, not by trusting the AI.
3. **Same patient, different insurer, different result**, because rules come from retrieved policies, not hard-coded logic.
4. **Human-in-the-loop** with an append-only audit trail.

---

## 3. Users

| Persona | Need |
|---|---|
| **PA Coordinator** (primary) | Fast packets, clear checklist, fewer rejections |
| **Ordering Physician** | Pinged only when a documentation gap needs their input |
| **Hospital Manager** | Dashboard: turnaround, readiness, gaps by reason |

Demo mode uses a role switcher (no real login) to save time.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Next.js 14 (App Router, TS)                 │
│  Screens: Dashboard · Case Queue · Workspace · Packet Review │
│                                                              │
│  API Route Handlers (Node runtime)                           │
│   /api/cases  /api/cases/[id]/run  /api/cases/[id]/gap ...   │
│                                                              │
│  Pipeline (plain async functions, no orchestration lib)      │
│   intake → policy RAG → matcher → gap → writer → verifier    │
│                    → readiness score                         │
└───────┬──────────────────────┬───────────────────────┬───────┘
        │                      │                       │
┌───────▼───────┐   ┌──────────▼──────────┐   ┌────────▼────────┐
│ MongoDB Atlas │   │ Embeddings (open)   │   │ LLM             │
│ cases, docs,  │   │ bge-small-en-v1.5   │   │ Claude API      │
│ policy chunks │   │ via transformers.js │   │ (+ Ollama       │
│ + vectors,    │   │ runs locally in Node│   │ fallback)       │
│ audit_log     │   └─────────────────────┘   └─────────────────┘
└───────────────┘
```

**Design principles**
- **Plain functions, not a framework.** Each "agent" is one async function with its own prompt and Zod schema. On the slides it is a "multi-agent pipeline", and in code it stays simple.
- **Structured outputs everywhere.** Agents return JSON validated by Zod. No free text passed between steps.
- **Evidence or it did not happen.** Any claim whose quote isn't found in the chart is rejected by code.
- **Humans decide.** Nothing is "submitted" without an Approve click.
- **Cache demo runs.** The full pipeline result for each demo case is stored in MongoDB, so if Wi-Fi or the API fails on stage the demo still runs.

---

## 5. Complete tech stack

### 5.1 Frontend

| Area | Choice |
|---|---|
| Framework | Next.js 14+ (App Router) + TypeScript |
| Styling / UI | Tailwind CSS + shadcn/ui + lucide-react |
| Data fetching | TanStack Query (polling for pipeline progress) |
| Forms / validation | React Hook Form + Zod |
| Charts | Recharts (dashboard + readiness gauge) |
| Letter editor | Plain `<textarea>`/contenteditable with citation chips; use TipTap only if time remains |
| Chart highlighter | Custom component: renders note text, wraps matched quote offsets in `<mark>` |
| Animation | Framer Motion (agent timeline), optional |

### 5.2 Backend (inside Next.js)

| Area | Choice |
|---|---|
| API | Next.js Route Handlers (`runtime = "nodejs"`) |
| Pipeline | Plain TypeScript async functions in `lib/agents/` |
| Validation | Zod |
| LLM SDK | `@anthropic-ai/sdk` (tool use for structured JSON) |
| Progress updates | Each step writes an event to the case document; the UI polls every ~1 s (SSE optional) |

### 5.3 Data and AI

| Area | Choice |
|---|---|
| **Database** | **MongoDB Atlas (free M0 tier)** or local MongoDB, via the official `mongodb` driver (or Mongoose) |
| **Vector search** | Store embeddings as arrays in the `policy_chunks` collection and compute **cosine similarity in Node**. With ~20-60 chunks this is instant and needs no index setup. Upgrade path: Atlas Vector Search (`$vectorSearch`) |
| **Open embedding model** | **`BAAI/bge-small-en-v1.5`** (384-dim), run locally with `@xenova/transformers` (`Xenova/bge-small-en-v1.5`). No API key, no cost |
| **Reranker (optional)** | `BAAI/bge-reranker-base`. Skip unless time remains, since the policy set is small |
| **LLM (primary)** | Claude via API for extraction, matching, writing, verifying (env var `CLAUDE_MODEL`, e.g. `claude-sonnet-5-5`) |
| **LLM (open fallback)** | **Ollama** running `qwen2.5:7b-instruct` or `llama3.1:8b` locally, with JSON-mode output validated by Zod. Weaker at extraction, so use it as a backup, not the main path |
| **PDF parsing** | `unpdf` or `pdf-parse` (policy PDFs and uploaded notes) |
| **PDF generation** | `pdf-lib` or `@react-pdf/renderer` (final packet PDF) |
| **Quote validation** | Custom `evidenceValidator.ts` (normalize whitespace, find offsets) |

### 5.4 DevOps

| Area | Choice |
|---|---|
| Hosting | **Run the demo on localhost** (safest). Optional: Vercel + MongoDB Atlas |
| Secrets | `.env.local` (never commit) |
| Version control | GitHub, short-lived branches, merge often |
| Demo safety | Cached results in MongoDB + a recorded backup video |

> **Gotcha:** transformers.js uses `onnxruntime-node`. In `next.config.js` add it to `experimental.serverComponentsExternalPackages` (Next 14), or `serverExternalPackages` (Next 15), and **never use the Edge runtime** for these routes. Run the embedding for policies **once in a seed script**, not at request time. At request time you only embed the short query.

---

## 6. Screens (4 core + 1 mock)

| # | Route | Screen | Purpose |
|---|---|---|---|
| 1 | `/` | **Dashboard** | KPI cards (open cases, cases with gaps, avg readiness, estimated minutes saved), "needs attention" list, small chart |
| 2 | `/cases` | **Case Queue** | Table: case ID, masked patient, procedure, insurer, status chip, readiness badge, filters. "New case" button opens a modal (pick patient, procedure, insurer, **Run Copilot**) |
| 3 | `/cases/[id]` | **Case Workspace (hero)** | Three columns: **chart** (left, highlighted quotes), **criteria checklist** (center, ✅❌⚠️), **agent timeline + gap panel** (right) |
| 4 | `/cases/[id]/packet` | **Packet Review** | Letter editor with citation chips (click for source quote), readiness gauge, verifier checklist, **Approve**, **Request changes**, **Reject** |
| 5 | `/cases/[id]/appeal` | **Appeal (mock)** | Paste or choose a sample rejection letter, see classified reason, counter-evidence, appeal draft |

Optional (only if time remains): `/audit` (list of audit entries), a landing page.

### Workspace layout

```
+-----------+---------------------+---------------------------+-----------------------------+
| Sidebar   | PATIENT CHART       | CRITERIA CHECKLIST        | AGENT TIMELINE (live)       |
| Dashboard |                     |                           | [done] Intake               |
| Cases     | "...4 weeks of      | [MET]     Prior X-ray     | [done] Policy retrieval     |
|           |  physiotherapy with | [MISSING] 6 wks PT   <--- | [done] Criteria matching    |
|           |  minimal relief"    | [UNCLEAR] Red flags       | [run ] Packet writer        |
|           |   ^ highlighted     |                           |                             |
|           |   when criterion    | Click a row -> quote      | GAP QUESTION                |
|           |   is clicked        | lights up in the chart    | "PT documented is 4 weeks.  |
|           |                     |                           |  Policy needs 6. Add record |
|           |                     |                           |  or clinical reason."       |
|           |                     |                           | [Attach] [Add note] [N/A]   |
+-----------+---------------------+---------------------------+-----------------------------+
```

---

## 7. Pipeline specification

All steps use Zod-validated JSON, with temperature 0-0.2.

### 7.1 Intake
- **Input:** raw chart text (notes, labs, history), each document with an ID.
- **Output (example):**
```json
{
  "diagnoses": [{ "text": "Right knee pain, chronic", "icd10_candidate": "M25.561", "quote": "chronic right knee pain" }],
  "prior_treatments": [{
    "type": "physical therapy", "duration_weeks": 4, "outcome": "minimal relief",
    "quote": "Completed 4 weeks of physiotherapy with minimal relief.", "doc_id": "note_02"
  }],
  "imaging_history": [{ "type": "X-ray right knee", "date": "2026-08-02", "quote": "X-ray of the right knee on 02 Aug 2026", "doc_id": "note_01" }],
  "red_flags": []
}
```
- **Guardrail:** the model returns `quote` and `doc_id` only. **Code** locates the quote in the document and stores `char_start`/`char_end`. If the quote is not found, the fact is dropped and logged.

### 7.2 Policy retrieval (RAG)
- **Ingestion (seed script, run once):** parse policy PDFs → split by section/bullet into chunks (~150-300 tokens) → embed with bge-small → insert into `policy_chunks` with metadata `{ payer, policy_id, procedure_code, section }`.
- **Query time:** filter by `payer` and `procedure_code`, embed the query ("approval criteria for MRI knee"), take the top-k by cosine similarity, then have the LLM convert the chunks into a **normalized checklist**:
```json
{ "criteria": [
  { "id": "C1", "text": "Plain X-ray of the knee completed", "required": true, "policy_ref": "PolicyA §2.1" },
  { "id": "C2", "text": "At least 6 weeks of conservative therapy (e.g., physiotherapy)", "required": true, "policy_ref": "PolicyA §2.2" }
]}
```
- **Why RAG matters in your demo:** you ship **two mock insurers** whose rules differ (e.g., Insurer A needs 6 weeks of PT, Insurer B needs 4). The same patient passes under B and fails under A. No code changes, just different retrieved text.

### 7.3 Criteria matcher
- For each criterion, compare against the extracted facts **and** the raw notes.
```json
{ "criterion_id": "C2", "status": "MISSING",
  "evidence": [{ "quote": "Completed 4 weeks of physiotherapy with minimal relief.", "doc_id": "note_02" }],
  "reasoning": "Documented 4 weeks; policy requires 6." }
```
- Statuses: `MET`, `MISSING`, `UNCLEAR`. When unsure, the model must choose `UNCLEAR`, never guess.
- **Code check:** every returned quote must pass `evidenceValidator`. A `MET` with no valid quote is downgraded to `UNCLEAR`.

### 7.4 Gap-closer
- For every `MISSING`/`UNCLEAR` criterion, write **one specific question** for the right person.
- Quick actions: **Attach document**, **Add note** (new evidence text), **Mark not applicable**, **Confirm not done**.
- When the doctor adds evidence, re-run the matcher for that criterion only. (The 4-to-6 weeks fix in the demo: the doctor attaches an updated PT note, and the checklist turns ✅.)

### 7.5 Packet writer
- Generates a **Letter of Medical Necessity** from a fixed template: patient summary → diagnosis → history → treatments tried → why the procedure is necessary → criteria addressed.
- **Rule:** each clinical sentence ends with a citation marker `[n]` that maps to a verified quote.
- Fills the **form fields** (patient, codes, provider, dates) from structured data.
- Output: Markdown letter + `citations[]` + a downloadable PDF.

### 7.6 Verifier (two layers)
1. **Code (deterministic):** each `[n]` resolves to a real quote; every required criterion is mentioned; patient name/ID match across documents; the CPT/ICD codes exist in the small lookup table.
2. **LLM (separate prompt):** acts as a strict auditor. Are there unsupported or contradictory statements? Is any required criterion unaddressed?
- **Output:** `PASS` or `FAIL` + issue list. On `FAIL`, retry the writer once with the issues, then hand to a human.

### 7.7 Readiness score (rule-based, not ML)
```
score = 100 × (Σ weight of MET criteria) / (Σ weight of all criteria)
weight: required = 2, optional = 1
UNCLEAR counts as 0.5 of its weight
cap at 60 if any required criterion is MISSING
```
- Label it **"Readiness Score"**, not "approval probability". Tell judges it is a transparent checklist score, and that with real approval/denial history it could be replaced by a trained model.

### 7.8 Appeal (mock, built last)
- Input: a **sample rejection letter** (you write one).
- Steps: classify the reason (missing documentation / not medically necessary / wrong code / other) → search the chart for counter-evidence (reuse the matcher) → draft an appeal letter with citations.
- Show it on **one** pre-seeded denied case. A human reviews before "sending".

---

## 8. Evidence validator (the part judges will love)

```ts
// lib/evidenceValidator.ts
const norm = (s: string) =>
  s.normalize("NFKC")
   .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
   .replace(/\s+/g, " ").trim().toLowerCase();

export function locateQuote(docText: string, quote: string) {
  // Build a normalized copy of the doc plus a map from normalized index -> original index
  let normDoc = "", map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < docText.length; i++) {
    let ch = docText[i];
    const isSpace = /\s/.test(ch);
    if (isSpace) { if (lastWasSpace) continue; ch = " "; }
    normDoc += ch.toLowerCase(); map.push(i);
    lastWasSpace = isSpace;
  }
  const q = norm(quote);
  const idx = normDoc.indexOf(q);
  if (idx === -1) return null;                       // quote not in chart -> reject
  return { start: map[idx], end: map[idx + q.length - 1] + 1 };
}
```
- Returns offsets for the highlighter, or `null` so the claim is rejected.
- **Metric to report:** *evidence grounding rate* = verified quotes ÷ quotes returned by the model. Run it on your 6 eval cases and show the real number.

---

## 9. Project structure

```
prior-auth-copilot/
├── app/
│   ├── page.tsx                      # Dashboard
│   ├── cases/
│   │   ├── page.tsx                  # Queue + new-case modal
│   │   └── [id]/
│   │       ├── page.tsx              # Workspace (hero)
│   │       ├── packet/page.tsx
│   │       └── appeal/page.tsx
│   └── api/
│       ├── cases/route.ts                       # GET list, POST create
│       ├── cases/[id]/route.ts                  # GET full state
│       ├── cases/[id]/run/route.ts              # POST start pipeline
│       ├── cases/[id]/gaps/[gapId]/route.ts     # POST resolve gap
│       ├── cases/[id]/packet/route.ts           # GET/PUT packet
│       ├── cases/[id]/approve/route.ts          # POST approve
│       ├── cases/[id]/denial/route.ts           # POST denial -> appeal draft
│       └── analytics/route.ts
├── components/
│   ├── ChartViewer.tsx               # highlights quote offsets
│   ├── CriteriaChecklist.tsx
│   ├── AgentTimeline.tsx
│   ├── GapPanel.tsx
│   ├── LetterEditor.tsx              # citation chips
│   ├── ReadinessGauge.tsx
│   └── ui/                           # shadcn
├── lib/
│   ├── db.ts                         # Mongo client (singleton)
│   ├── llm.ts                        # Claude wrapper + Ollama fallback
│   ├── embed.ts                      # bge-small via transformers.js
│   ├── evidenceValidator.ts
│   ├── schemas.ts                    # Zod schemas
│   ├── codes.ts                      # tiny CPT/ICD lookup
│   └── agents/
│       ├── intake.ts  policy.ts  matcher.ts  gapCloser.ts
│       ├── writer.ts  verifier.ts  readiness.ts  appeal.ts
│       └── pipeline.ts               # runs steps in order, logs events
├── data/
│   ├── policies/  insurerA_mri.md  insurerB_mri.md   (mock)
│   ├── patients/  patientA.json  patientB.json  patientC.json ...
│   ├── eval/      cases.json         (6 labeled cases)
│   └── rejection_letter_sample.txt
├── scripts/
│   ├── seed.ts                       # patients, docs, codes
│   ├── ingest-policies.ts            # chunk + embed + store
│   └── eval.ts                       # prints accuracy numbers
├── .env.local
└── README.md
```

---

## 10. MongoDB collections

```js
patients        { _id, mrn, name_masked, age, sex, insurer }
documents       { _id, patient_id, doc_id, type, title, text, created_at }   // chart notes
cases           { _id, patient_id, procedure_code, icd10_codes[], insurer, status,
                  facts[],            // intake output, with quote + char_start/char_end
                  criteria[],         // retrieved checklist
                  results[],          // matcher output per criterion
                  gaps[], events[],   // gap questions + agent timeline events
                  readiness, created_at, updated_at }
policies        { _id, insurer, name, procedure_codes[], version }
policy_chunks   { _id, policy_id, insurer, procedure_code, section, text, embedding: number[384] }
packets         { _id, case_id, letter_md, form_json, citations[], verifier_status,
                  verifier_issues[], version, pdf_path }
submissions     { _id, case_id, approved_by, approved_at, mock_reference, outcome, outcome_reason }
appeals         { _id, case_id, reason_class, letter_md, status }
audit_log       { _id, case_id, actor_type, actor, action, payload, created_at }  // insert-only
```
- Statuses: `DRAFT → RUNNING → NEEDS_INFO → READY_FOR_REVIEW → APPROVED_BY_HUMAN → SUBMITTED(mock) → DENIED → APPEAL_DRAFTED`
- **Audit rule:** only ever call `insertOne` on `audit_log`. No update or delete code paths exist.
- Embedded arrays (`facts`, `results`, `gaps`, `events`) inside `cases` keep reads to one query, which suits this app.

---

## 11. Data and datasets

| Need | Source | Notes |
|---|---|---|
| **Patient charts** | **Write 5-6 charts yourselves** (an LLM can draft them from your templates; you edit and **plant** gaps) | Highest value for time. Each chart is 2-4 short notes (visit note, PT note, X-ray report) |
| Note style realism | **MTSamples** (Kaggle, public medical transcription samples) | Look at orthopedic samples for wording. Don't copy them wholesale |
| Optional structured patients | **Synthea** (open-source synthetic patient generator) | Only if you have a spare hour. Not needed for the MVP |
| **Insurer policies** | **Write 2 short mock policies** (Insurer A, Insurer B), 1-2 pages each, covering knee MRI and lumbar MRI | Model the *structure* on public criteria such as CMS coverage determinations (LCD/NCD) and ACR Appropriateness Criteria, but write them in your own words. Label them "MOCK" in the UI |
| **Code lookup** | Hand-written `codes.ts` with ~5 entries | **ICD-10-CM** codes are public (e.g., M25.561 knee pain right; M17.11 primary osteoarthritis right knee). **CPT** codes belong to the AMA, so keep just 2-3 with your own plain descriptions (73721 knee-joint MRI w/o contrast; 72148 lumbar spine MRI w/o contrast) and say "demo only". **Verify every code before presenting** |
| Rejection letter | Write 1 sample (reason: "insufficient documentation of conservative therapy") | For the appeal screen |

### The 6 evaluation cases (build these first)

| Case | Patient | Insurer | Expected |
|---|---|---|---|
| 1 | A: 8 weeks PT, X-ray done | A | All MET, high readiness |
| 2 | B: **4 weeks PT**, X-ray done | A | PT criterion **MISSING** (demo case) |
| 3 | B (same patient) | B (needs 4 weeks) | All MET (shows RAG effect) |
| 4 | C: notes vague on PT ("some exercises") | A | PT **UNCLEAR** |
| 5 | D: no X-ray documented | A | X-ray MISSING |
| 6 | E: red-flag symptom documented (e.g., locked knee) | A | Red-flag exception MET |

`scripts/eval.ts` runs all 6 and prints: **criteria match accuracy**, **evidence grounding rate**, **gap detection recall**. Show these real numbers on one slide.

---

## 12. Safety, privacy, honesty

| Concern | Mitigation |
|---|---|
| Hallucination | Verbatim quote validation in code, a separate verifier pass, uncited claims removed |
| Autonomous action | Nothing is submitted without human approval, and submission is a mock |
| PHI | Demo uses synthetic data only. Production would de-identify before any LLM call, use a vendor agreement or a self-hosted model (the Ollama path), and encrypt at rest |
| Auditability | Append-only audit log of every AI output and human decision |
| Scope | This is **administrative decision support**. It does not diagnose or order care |
| Honest limits (say them) | Synthetic data; mock policies; rule-based score; CPT/ICD demo subset; not validated on real hospital data |

---

## 13. Environment setup

```bash
npx create-next-app@latest prior-auth-copilot --ts --tailwind --app
cd prior-auth-copilot
npx shadcn@latest init
npm i mongodb zod @anthropic-ai/sdk @xenova/transformers unpdf pdf-lib \
      @tanstack/react-query recharts lucide-react react-hook-form
npm i -D tsx
```

`.env.local`
```
MONGODB_URI=mongodb+srv://...            # or mongodb://localhost:27017/pac
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-sonnet-5-5
LLM_PROVIDER=claude                      # or "ollama" for the offline fallback
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
```

Optional offline fallback:
```bash
ollama pull qwen2.5:7b-instruct
```

---

## 14. 12-hour build plan

Assumes 3-4 people. Adjust the split to your team.

| Hours | Frontend | Backend / AI | Data / Demo |
|---|---|---|---|
| **0-1** | Scaffold app, shadcn, layout + sidebar | Mongo connection, Zod schemas, `llm.ts` | Lock 2 procedures, 2 mock insurers |
| **1-3** | Case Queue + new-case modal (mock data) | **Intake agent** + `evidenceValidator` | Write patients A, B, C + notes |
| **3-5** | **Workspace shell**: chart, checklist, timeline | **Policy ingest + RAG** (chunk, embed, retrieve) | Write 2 mock policies, patients D, E |
| **5-7** | Quote highlighting, click-to-scroll, gap panel | **Matcher + gap-closer + re-run on new evidence** | Rejection letter, `eval.ts` cases |
| **7-9** | **Packet Review**: letter editor, citation chips, gauge | **Packet writer + verifier + readiness score** + PDF | Run eval, fix prompt failures |
| **9-10** | Dashboard (KPIs from real data) | Approve flow + audit log | Cache all demo-case results in Mongo |
| **10-11** | Appeal screen (mock) | Appeal agent on 1 case | **Rehearse** full demo twice |
| **11-12** | Polish, empty/error states | Bug fixes, **freeze code** | **Record backup video**, finalize slides |

**Freeze rule:** no new features after hour 10.
**If behind schedule, cut in this order:** Appeal agent → Dashboard charts → PDF export → TipTap editor → Ollama fallback.
**Never cut:** criteria-vs-evidence view, the gap catch, citations with validation, human approval, cached demo results.

---

## 15. Demo script (5 minutes: 10:52-10:57)

| Time | What you do and say |
|---|---|
| 0:00-0:40 | **Problem.** "A doctor orders a knee MRI. Before it can happen, staff spend a long stretch reading charts and matching insurer rules, and one missing line means rejection. Pakistani panel-hospital insurers have the same pre-approval step." (Say "estimated" for any time figure.) |
| 0:40-1:10 | **Start the case.** Open the queue, pick Patient B + Insurer A + knee MRI, click **Run Copilot**. Timeline streams. |
| 1:10-2:20 | **The checklist.** ✅ X-ray found. ❌ **"6 weeks of PT not documented. Chart shows 4 weeks."** Click the row, the exact quote lights up in the chart. "The system caught this *before* submission." |
| 2:20-2:50 | **RAG moment.** Switch the same patient to Insurer B. The rule changes (4 weeks), and the checklist turns green. "No code changed, only the retrieved policy." |
| 2:50-3:30 | **Fix and packet.** On Insurer A, the doctor attaches the updated PT note, and ❌ turns ✅. Open **Packet Review**: the letter with citation chips, and click one to show the source quote. Readiness score rises. |
| 3:30-4:15 | **Trust.** Show the verifier checklist and the grounding rate from your eval ("N of N citations verified on our 6 test cases"). Click **Approve**, then show the audit log entry. |
| 4:15-5:00 | **Impact + honesty.** Seeded denied case with the appeal draft (10 s). Close: "Synthetic data and mock policies today. Next: real policy ingestion, EHR integration, and a trained denial model once real outcome data exists." |

**Backup plan:** if the API or Wi-Fi fails, switch to the cached results (already in MongoDB) or play the backup video. Decide this *before* going on stage.

---

## 16. Judge Q&A

| Question | Answer |
|---|---|
| What if the AI makes things up? | Every claim needs a quote that code verifies exists in the chart. Unverifiable claims are rejected, a second pass audits the packet, and a human approves. |
| Is a human in control? | Yes. Nothing is submitted without approval, and every action is logged. |
| Is your data real? | No, it's synthetic charts and mock policies, to avoid patient privacy issues. Production would integrate with hospital systems under proper privacy controls. |
| Why a "readiness score" instead of approval probability? | We have no real approval history, so we use a transparent checklist score. A trained model is the roadmap once outcome data exists. |
| How do you handle different insurers? | RAG over each insurer's policy document. A new insurer is a new document, not new code. |
| Why not just use ChatGPT? | A chatbot can invent evidence. We force quote-level grounding, validate in code, retrieve actual policy text, and add human approval and audit logging. |
| Can it run privately? | Yes. Embeddings already run locally, and the LLM can be swapped to a self-hosted open model via Ollama for sensitive deployments (with lower extraction quality). |
| What's the impact? | Less staff time per request and fewer preventable rejections. We measured grounding and gap-detection on 6 test cases, and any time saving is an estimate until piloted. |

---

## 17. Pitch lines

> **"We don't replace doctors or billing staff. We give them an AI assistant that catches the missing proof before the insurer does."**

Taglines: *"Catch the rejection before it happens."* · *"Every claim cited. Every decision human."*

---

## 18. Stretch goals (after the event, not now)

- Trained denial-risk model on real outcome data.
- Peer-to-peer call prep sheet for physicians.
- Urdu patient-facing summaries.
- Hospital system integration (HL7 FHIR).
- Auto-detect insurer policy updates.
- Fairness and bias evaluation on real data.

---

## 19. Final checklist before 10:52 AM, 11 Oct

- [ ] All 6 eval cases run and numbers are on the results slide
- [ ] Demo case (Patient B) results cached in MongoDB
- [ ] Backup video recorded and on the laptop (not only online)
- [ ] `.env.local` working on the demo machine, API key has credit
- [ ] "SYNTHETIC DATA / MOCK POLICY" label visible in the UI
- [ ] Every code, statistic, and policy criterion on the slides verified or marked as estimated/demo
- [ ] Each team member can answer: how citations are validated, how RAG works, what the score means
- [ ] Rehearsed with a timer at least twice (target 4:30)
