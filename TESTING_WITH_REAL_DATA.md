# Testing the prototype with Groq and real data

This guide takes you from the synthetic demo to a test on **real clinical notes and a real insurer
policy**, using Groq as the LLM. Follow the steps in order. Each step ends with a check.

> **Privacy first.** Groq is an external service. Never send identifiable patient data to it. Use
> public de-identified notes (step 3a), or hospital notes only with written permission and after removing
> every identifier (names, dates of birth, MRN/CNIC, phone, address, exact dates if possible).

---

## Step 1. Get a Groq API key

1. Go to https://console.groq.com, sign in, open **API Keys**, click **Create API Key**, and copy it.
2. Open **Models** in the Groq console and note which models your account can use.
3. Open `.env.local` in the project and set:
   ```
   LLM_PROVIDER=groq
   GROQ_API_KEY=<paste your key>
   GROQ_MODEL=openai/gpt-oss-120b
   GROQ_JSON_MODE=schema
   ```
   If that model is not in your console, use one that is (for example `llama-3.3-70b-versatile`) and set
   `GROQ_JSON_MODE=object`.

**Check:** none yet. Step 2 confirms the key works.

## Step 2. Seed the database and smoke-test Groq on the built-in cases

Your `.env.local` points at your MongoDB Atlas cluster, so the data goes there.

1. In MongoDB Atlas, open **Network Access** and make sure your current IP address is allowed.
2. Run:
   ```bash
   npm run seed     # WIPES the configured database, then loads policies, patients, and demo cases
   npm run eval     # scores the 6 labeled synthetic cases with Groq
   ```
   With Groq, seeding takes a few minutes because each case makes 6 to 8 LLM calls and the free tier is
   rate limited. The script waits and retries automatically.

**Check:**
- `npm run eval` prints `Evaluating 6 cases with Groq (...)`.
- No `[pipeline] ... Falling back to the offline rules engine` lines. If you see them, read the reason
  printed (invalid key, model not found, rate limited) and fix it using the troubleshooting table below.
- Note the three numbers (accuracy, grounding, recall). These are Groq's real scores on the synthetic set.

## Step 3. Collect real data

### 3a. Real clinical notes (pick one source)

| Source | What to take |
|---|---|
| **MTSamples** (mtsamples.com, or the "Medical Transcriptions" dataset on Kaggle) | Real transcribed medical reports, already de-identified. Filter the Orthopedic and Radiology specialties and pick knee or lumbar cases: a consultation note, a physical therapy note, and an X-ray report |
| **Your hospital** (only with permission) | 2 to 4 notes for one MRI request. De-identify them before they leave the hospital system |

Gather at least **5 cases** so the numbers mean something, ideally with a mix: some complete, some
missing therapy duration, some missing an X-ray.

### 3b. A real insurer policy (pick one source)

| Source | What to take |
|---|---|
| **CMS Medicare Coverage Database** (cms.gov/medicare-coverage-database) | Search for an LCD or article on MRI of the knee or lumbar spine. Copy the "Coverage Indications" criteria |
| **Commercial payers** | Aetna Clinical Policy Bulletins, Cigna, UnitedHealthcare, and eviCore or Carelon imaging guidelines are public. Find the knee or lumbar MRI criteria |
| **Pakistani panel insurer** | Ask your hospital's insurance desk for the insurer's pre-authorization criteria for MRI |

**Check:** you have the policy's exact criteria wording and its source link and date.

## Step 4. Add the real policy

1. Copy `data/real/_template/policy_TEMPLATE.md` to `data/policies/realinsurer_mri.md` (any name that does
   not start with `_`).
2. Fill the front matter: a unique `policy_id`, a new `insurer` id (for example `INS-REAL`), and
   `insurer_name`.
3. Paste each approval criterion **verbatim** under its own `## <number> <title> [required]` heading with
   `procedure: <CPT>` underneath. Mark exceptions (red flags) `[optional]`. Keep numbers such as
   "6 weeks" exactly as written.
4. Run:
   ```bash
   npm run ingest   # adds the policy and registers the new insurer; does not wipe anything
   ```

**Check:** the output lists your file, its sections, and `Registered insurer INS-REAL`.

## Step 5. Check the codes

The app only knows the CPT and ICD-10 codes in `lib/codes.ts`. If your cases use other codes, add them
there, after checking each one against the official ICD-10-CM list and your CPT source.

**Check:** every code in your cases appears in `lib/codes.ts`.

## Step 6. Import each real patient

For each case, create a folder such as `data/real/case01/` (start from `data/real/_template/`):

```
data/real/case01/
  patient.json          procedure_code, icd10_codes, default_insurer (for example INS-REAL), de-identified label
  01_visit_note.txt     one note per file
  02_xray.txt
  attach/03_pt.txt      optional: a note that is NOT in the chart yet, to test "Attach document"
```

Each `.txt` starts with header lines, a blank line, then the note copied exactly:

```
Title: Orthopedic consultation
Type: visit_note
Date: 2026-09-12
Author: Orthopedics

CHIEF COMPLAINT: Right knee pain. ...
```

Then run:

```bash
npm run import:patient -- data/real/case01     # one folder
npm run import:patient                         # or every folder in data/real/
```

Real patients in `data/real/` are re-imported automatically every time you run `npm run seed`.

**Check:** the output says `Imported <label> (...) with N chart notes`. If it complains about a code or an
insurer, fix `patient.json` and run it again.

## Step 7. Run the copilot on a real case

1. `npm run dev`, then open http://localhost:3000.
2. **Cases → New case**, pick your real patient, the procedure, and your real insurer, then **Run Copilot**.
3. Review the result like a reviewer would:
   - The timeline steps show a **Groq** chip and no yellow warnings.
   - Click each criterion: the highlighted text in the chart is the right evidence.
   - The gap questions make sense to a clinician.
   - **Open packet**: every citation chip opens a real quote, the verifier passes, and the PDF downloads.
   - The agent-timeline footer shows how many quotes were verified. A rejected quote means the model
     invented or altered text, and the validator caught it.
4. If you added an `attach/` note, use **Attach document** on the gap and confirm that only that criterion
   is re-checked.

## Step 8. Measure accuracy honestly

1. Copy `data/eval/real_cases.example.json` to `data/eval/real_cases.json`.
2. For each case, have a clinician or coordinator write the expected status of every criterion
   (`MET`, `MISSING`, `UNCLEAR`, `NA`) **before looking at the copilot's output**. Criterion ids (C1, C2...)
   follow the section order of your policy file.
3. Run:
   ```bash
   npm run eval -- data/eval/real_cases.json
   ```
4. Results are saved to `data/eval/real_cases.results.json`. The app keeps showing the synthetic numbers.

**Check:** you have accuracy, grounding rate, and gap recall on real notes. Write down every miss and why,
because judges will ask. Present these as "measured on N real de-identified cases", not as clinical validation.

---

## Troubleshooting

| Message (timeline warning or terminal) | Fix |
|---|---|
| `Groq: GROQ_API_KEY is not set` / `invalid API key` | Check `.env.local`, then restart `npm run dev` (env changes need a restart) |
| `Groq: model "..." not found` | Set `GROQ_MODEL` to a model listed in your Groq console |
| `Groq: rate limited after 3 attempts` | Free-tier per-minute limit. Wait a minute, use fewer or shorter notes, or a smaller model |
| `Groq output failed schema validation` / `invalid JSON` | Try `GROQ_JSON_MODE=object`, or a stronger model |
| `Groq output was truncated` | Notes are too long for one call. Split very long notes and keep only the relevant parts |
| `skipping the LLM for a minute` | A previous call failed with a network or key error, so the app switched to the offline engine for 60 s. Fix the cause, wait, and re-run |
| Seed or app cannot reach MongoDB | Add your IP in Atlas **Network Access**, or empty `MONGODB_URI` to use the local file store |
| A criterion from your policy never appears | Its heading needs `[required]` or `[optional]` and a `procedure:` line with the right CPT. Run `npm run ingest` again |

## Before the demo

- Decide which provider you will present with and run `npm run seed` with it, so the cached results
  ("Use cached result") match.
- If the venue Wi-Fi is unreliable, set `LLM_PROVIDER=rules` and `MONGODB_URI=` (local store). The
  synthetic demo works fully offline.
