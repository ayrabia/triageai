# TriageAI — Claude Context

## What This Project Is

AI-powered referral triage for specialty clinics. Faxed PDFs arrive → Claude classifies them as **PRIORITY REVIEW / SECONDARY APPROVAL / STANDARD QUEUE** → staff get a prioritized queue instead of a pile of unnamed fax documents.

**This is an administrative workflow tool, not a clinical decision support system.** The AI extracts and surfaces information; triage staff (PAs, NPs, clinical managers) make all final decisions.

---

## Current Status (as of March 2026)

- Proof of concept complete and validated on 6 real de-identified ENT referrals from **Sacramento Ear, Nose & Throat (SacENT)**
- **Active pipeline: v3** (three-tier, no triage notes = production-realistic scenario)
- Awaiting clinical validation from **Nadia Rabia** (Referral Coordinator at SacENT) — she is the domain expert who defined the ENT urgent criteria
- Pre-seed / concept stage

---

## Pipeline Architecture

```
Fax PDF (S3, AES-256)
  → PDF pages → JPEG at 200 DPI
  → All images + prompt → Claude Sonnet 4.6 via AWS Bedrock (single API call)
  → Structured JSON output
  → Saved to file (prod: encrypted PostgreSQL, HIPAA 6-year retention)
```

**Why Bedrock:** Existing AWS BAA covers it — no separate Anthropic HIPAA agreement needed. All data stays within AWS.

Claude does OCR + medical entity extraction + classification in one call (~30–90 seconds).

---

## Three-Tier Classification

| Tier | When it fires |
|------|--------------|
| **PRIORITY REVIEW** | Clinical content matches ENT urgent criteria — regardless of provider label |
| **SECONDARY APPROVAL** | Provider marked urgent/STAT but no clinical criteria match. Never silently downgrade a provider's urgent label. |
| **STANDARD QUEUE** | No criteria matched AND provider did NOT mark urgent (both agree it's routine) |

**Safety principle:** STANDARD QUEUE only fires when both clinical content AND provider label agree it's routine.

---

## ENT Urgent Criteria (defined by Nadia Rabia)

1. Confirmed or suspected cancer/malignancy
2. Rapidly growing neck or oral lesions
3. Nasal fractures (1–2 week surgical window)
4. Sudden hearing loss
5. Airway compromise or obstruction
6. Tongue ties in infants with feeding issues
7. Peritonsillar abscess
8. Foreign body in ear/nose/throat

---

## Pipeline Versions

- **v1** (`pipeline_test.py`, `pipeline_results/v1_two_tier/`) — Binary PRIORITY REVIEW / STANDARD QUEUE. No provider label check, no reasoning.
- **v2** (`pipeline_test_v2.py`, `pipeline_results/v2_three_tier/`) — Three-tier. Problem: original scans had triage NP's override notes visible. Not production-realistic.
- **v3** (`pipeline_results/v3_notriage/`) — Same prompt as v2. Referrals physically rescanned with triage decisions covered. **This is the production scenario.** Primary evaluation dataset.

---

## Known Bug (Fixed in v3)

**Referral 06 action/reasoning mismatch:** JSON `action` field output "STANDARD QUEUE" but reasoning text said "SECONDARY APPROVAL NEEDED." Root cause: LLM output formatting slipped from correct internal reasoning when generating structured JSON.

**Fix:** Added to prompt — *"CRITICAL: The action field MUST match your reasoning. STANDARD QUEUE is ONLY for cases where no criteria matched AND the provider did NOT mark it urgent. Double-check your action field before outputting."*

This is a **safety requirement** — the wrong action field silently drops urgent patients into the standard queue.

---

## Key Files

```
classifier/
  classifier.py       — Core classifier, Claude primary / GPT-4o fallback
  prompts.py          — ENT system prompt + generic specialty prompts
  test_classifier.py  — Pytest suite (10 test cases)

pipeline/
  pipeline_test_v2.py — Three-tier pipeline (current version, 420 lines)
  ocr.py              — AWS Textract wrapper
  nlp.py              — AWS Comprehend Medical wrapper
  missing_info.py     — Rule-based missing field detection (regex, per specialty)
  pipeline_results/
    v1_two_tier/      — v1 results
    v2_three_tier/    — v2 results
    v3_notriage/      — v3 results (primary evaluation set)

app/
  main.py             — FastAPI entry
  routes/referrals.py — POST /referrals/ endpoint
  routes/health.py    — GET /health

streamlit_demo/demo.py — Interactive demo UI

evaluation/
  score.py            — Evaluates v3 results vs ground truth, computes precision/recall/F1
  results/            — JSON metrics files per eval run

referrals/
  Redacted_Referrals/         — 6 de-identified test referrals (R01–R06)
  Training_Redacted_Referrals/ — Training set used for v3 evaluation
```

---

## Tech Stack

- **LLM:** Claude Sonnet 4.6 via AWS Bedrock (primary), GPT-4o fallback
- **Backend:** FastAPI + Uvicorn
- **Demo:** Streamlit
- **DB:** PostgreSQL on AWS RDS (planned)
- **Auth:** Auth0 / AWS Cognito (planned)
- **Fax:** Phaxio / Documo (planned)
- **Language:** Python 3.11+

---

## v3 Evaluation Results (6 referrals, March 22, 2026)

| Referral | Condition | Classification |
|---|---|---|
| R01 | Thyroid carcinoma | PRIORITY REVIEW ✓ |
| R02 | Tinnitus/hearing loss | SECONDARY APPROVAL ✓ |
| R03 | Tongue base mass (suspected SCC) | PRIORITY REVIEW ✓ |
| R04 | Nasal fracture (delayed healing) | PRIORITY REVIEW ✓ |
| R05 | Tonsillar cyst/polyp | SECONDARY APPROVAL ✓ |
| R06 | Pediatric recurrent otitis media | SECONDARY APPROVAL ✓ (after bug fix) |

**0 missed urgent cases. 0 silent downgrades after bug fix.**

---

## HIPAA Compliance

**Every decision in this codebase must be evaluated against HIPAA requirements. When in doubt, the more restrictive choice applies.**

### What counts as PHI in this system
- Patient name, DOB, address, phone, email, SSN, MRN
- Any free-text in referral documents (the PDFs themselves)
- The `s3_key` field — it maps directly to a document containing PHI
- The `summary`, `referral_reason`, `reasoning`, and `relevant_clinical_findings` fields — these are AI-extracted clinical text from PHI documents
- Anything in `audit_log.old_value` / `new_value` that captures referral content

### Encryption
- S3: AES-256 SSE enforced at bucket level — never disable this
- RDS: encryption at rest required — use encrypted RDS instances only
- Transit: TLS 1.2+ everywhere — never allow HTTP in production
- `.env` contains secrets (DATABASE_URL, API keys) — never commit it, never log it

### AWS BAA Coverage
- AWS Bedrock is covered under the existing AWS BAA — this is why Bedrock is the primary path
- If a non-BAA service is ever considered (e.g. direct Anthropic API, OpenAI), it requires a separate BAA before any real PHI can touch it
- GPT-4o fallback in `classifier.py` is NOT covered — do not route real PHI through it until a BAA is in place

### Logging rules
- **Never log PHI** — no patient names, DOBs, MRNs, or referral content in any log output
- The `s3_key` is sensitive — treat it like PHI in logs
- Structured logs should contain only: referral UUID, action (enum), timing, error codes
- No PHI in error messages returned to clients

### Audit trail
- `audit_log` is append-only — never add UPDATE or DELETE routes for it
- HIPAA requires 6-year retention — implement RDS backup retention and lifecycle rules accordingly
- Every time a staff user views, changes status, or exports a referral, an audit entry must be written
- System events (pipeline completion, ingestion) are also logged with `user_id=null`

### Authentication gap (current)
- `get_current_user` in `app/dependencies.py` is a **development placeholder** — it accepts an `X-User-Id` header with no verification
- This is NOT secure and must be replaced with real JWT verification (Auth0 or AWS Cognito) before any real PHI touches the system
- No production deployment until auth is real

### Local development rules
- The Docker Postgres instance is for **de-identified test data only**
- `scripts/seed.py` loads de-identified referrals — never modify it to load real patient data
- Never copy real referral PDFs into the local environment
- The `referrals/Redacted_Referrals/` and `referrals/Training_Redacted_Referrals/` directories contain de-identified documents — verify before adding any new files

### Multi-clinic data isolation
- Every DB query on `referrals` and `audit_log` must filter by `clinic_id`
- A coordinator at Clinic A must never be able to retrieve Clinic B's records — enforce this at the query level, not just the UI level
- `clinic_id` scoping must be derived from the authenticated user's JWT, not from a request parameter

### Pre-production checklist (must complete before real PHI)
- [ ] Replace `get_current_user` placeholder with real JWT verification
- [ ] Enable RDS encryption at rest
- [ ] Set `ALLOWED_ORIGINS` to production domain only (remove localhost)
- [ ] Configure RDS to reject non-SSL connections
- [ ] Set up CloudWatch log groups with no PHI logging policy
- [ ] Enable RDS automated backups with 6-year retention
- [ ] Confirm AWS BAA is active and covers all services in use
- [ ] Penetration test before go-live
