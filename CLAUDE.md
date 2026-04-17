# TriageAI — Claude Context

## What This Project Is

AI-powered referral triage for specialty clinics. Faxed PDFs arrive → Claude classifies them as **PRIORITY REVIEW / SECONDARY APPROVAL / STANDARD QUEUE** → staff get a prioritized queue instead of a pile of unnamed fax documents.

**This is an administrative workflow tool, not a clinical decision support system.** The AI extracts and surfaces information; triage staff (PAs, NPs, clinical managers) make all final decisions.

---

## Current Status (as of April 2026)

- POC validated on 6 real de-identified ENT referrals from **Sacramento Ear, Nose & Throat (SacENT)** — 0 missed urgents, 0 silent downgrades
- **Active pipeline: v3** (three-tier, no triage notes = production-realistic scenario)
- **Deployed on AWS** — ECS Fargate (frontend) + Lambda (pipeline)
- Awaiting clinical validation from **Nadia Rabia** (Referral Coordinator at SacENT)
- Pre-seed / concept stage

---

## Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://app.usetriageai.com |

---

## Infrastructure (all AWS, all under BAA)

| Layer | Service |
|-------|---------|
| Database | AWS RDS PostgreSQL (`triageai-prod.cqdyykwmcudh.us-east-1.rds.amazonaws.com`) |
| Auth | AWS Cognito — User Pool `us-east-1_B5EPFtIfW`, Client `5ln3morakigit80ae0m8i295qb` |
| Storage | AWS S3 — bucket `triageai-test-referrals` |
| LLM | AWS Bedrock — `us.anthropic.claude-sonnet-4-6` |
| Container registry | AWS ECR — `177884821405.dkr.ecr.us-east-1.amazonaws.com` |

### Lambda pipeline
- Function: `triageai-pipeline` (`arn:aws:lambda:us-east-1:177884821405:function:triageai-pipeline`)
- Trigger: S3 `ObjectCreated` on `triageai-test-referrals/ui-uploads/*.pdf`
- Memory: 1024 MB, Timeout: 300s
- Rebuild: `docker build --platform linux/amd64 --provenance=false --sbom=false -t ...` (**must use `--provenance=false`** — Lambda rejects OCI manifest lists from buildx)

### Redeploying

```bash
# Authenticate Docker
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 177884821405.dkr.ecr.us-east-1.amazonaws.com

# Frontend (Next.js) — NEXT_PUBLIC_* vars must be passed at build time
cd frontend
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_COGNITO_REGION=us-east-1 \
  --build-arg NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=5ln3morakigit80ae0m8i295qb \
  -t 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-frontend:latest .
docker push 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-frontend:latest
# Force ECS to pull the new image
aws ecs update-service --cluster triageai --service triageai-frontend \
  --force-new-deployment --region us-east-1

# Pipeline (Lambda) — must use --provenance=false (Lambda rejects OCI manifest lists)
cd /path/to/triageai
docker build --platform linux/amd64 --provenance=false --sbom=false \
  -t 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-pipeline:latest \
  -f lambda/Dockerfile .
docker push 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-pipeline:latest
aws lambda update-function-code \
  --function-name triageai-pipeline \
  --image-uri 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-pipeline:latest \
  --region us-east-1
```

**Critical:** `NEXT_PUBLIC_*` variables in Next.js are baked into the JS bundle at build time — they cannot be injected at runtime. Always pass them as `--build-arg` when building the frontend image.

---

## User Provisioning

Users must exist in **both** Cognito and the `users` table in RDS. Creating a Cognito account alone is not enough.

### Steps to add a new user

1. Create Cognito account:
```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_B5EPFtIfW \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS --region us-east-1

aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_B5EPFtIfW \
  --username user@example.com \
  --password 'Password123!' --permanent --region us-east-1
```

2. Get the Cognito `sub`:
```bash
aws cognito-idp list-users --user-pool-id us-east-1_B5EPFtIfW --region us-east-1 \
  --query 'Users[*].{Email:Attributes[?Name==`email`].Value|[0],Sub:Attributes[?Name==`sub`].Value|[0]}'
```

3. Insert into DB (role must be uppercase: `ADMIN`, `COORDINATOR`, or `REVIEWER`):
```python
cur.execute(
    "INSERT INTO users (id, email, name, role, clinic_id, auth_provider_id) VALUES (%s,%s,%s,%s,%s,%s)",
    (str(uuid.uuid4()), 'user@example.com', 'Full Name', 'COORDINATOR',
     '00000000-0000-0000-0000-000000000001', '<cognito-sub>')
)
```

**Note:** The PostgreSQL `userrole` enum stores uppercase values (`ADMIN`, `COORDINATOR`, `REVIEWER`). Inserting lowercase will cause a SQLAlchemy `LookupError` at runtime.

### Current users

| Email | Role | Clinic |
|-------|------|--------|
| `ayman@usetriageai.com` | ADMIN | Sacramento ENT |
| `nadia.rabia@usetriageai.com` | COORDINATOR | Sacramento ENT |

Clinic ID for Sacramento ENT: `00000000-0000-0000-0000-000000000001`

---

## Pipeline Architecture

```
Fax PDF (S3, AES-256)
  → PDF pages → JPEG at 150 DPI (keeps under Bedrock's 2000px/dimension limit)
  → All images + prompt → Claude Sonnet 4.6 via AWS Bedrock (single API call)
  → Structured JSON output
  → Saved to encrypted PostgreSQL (HIPAA 6-year retention)
```

**Why 150 DPI:** Bedrock multi-image requests have a 2000px per dimension limit. Letter-size at 200 DPI = 1700×2200px which exceeds it. 150 DPI = 1275×1650px which fits.

**Why Bedrock:** Existing AWS BAA covers it — no separate Anthropic HIPAA agreement needed.

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

## Frontend Structure

Pages:
- `/` — Home dashboard: role-aware (coordinators: tier cards + upload; physicians: my queue + all cases)
- `/priority` — Priority Review queue
- `/secondary` — Secondary Approval queue
- `/standard` — Standard Queue
- `/pending` — In-pipeline queue (processing + failed), polls every 10s
- `/my-queue` — Physician's assigned referrals
- `/all-cases` — Physician's view of all referrals
- `/referrals/[id]` — Referral detail + PDF viewer
- `/login` — Cognito login with show/hide password

Key components:
- `TierQueue.tsx` — shared tier page component
- `PendingQueue.tsx` — in-pipeline queue with Dismiss button (archives failed referrals)
- `QueueCard.tsx` — urgency badge always first, filename shown
- `UploadZone.tsx` — drag-and-drop PDF upload
- `ActionButtons.tsx` — role-aware: physicians see Mark Reviewed + Archive; coordinators/admins see Approve & Route + escalate
- `RouteModal.tsx` — physician picker modal for coordinator routing

**Archived referrals** (dismissed via Dismiss button) are excluded from all queue counts — the home page filters `status !== 'archived'` client-side.

### Next.js Route Handlers (`frontend/app/api/`)
- `GET  /api/referrals` — paginated queue with filters
- `POST /api/referrals/upload` — PDF upload → S3 + DB insert
- `POST /api/referrals/ingest` — pipeline callback (PIPELINE_SECRET auth)
- `GET  /api/referrals/[id]` — referral detail + audit log write
- `PATCH /api/referrals/[id]/status` — status transitions
- `POST /api/referrals/[id]/route` — route to physician (coordinator/admin only)
- `GET  /api/referrals/[id]/pdf` — presigned S3 URL (5 min TTL)
- `GET  /api/referrals/[id]/audit` — audit trail (coordinator/admin only)
- `GET  /api/users/me` — current user profile
- `GET  /api/users/physicians` — list physicians in clinic
- `GET  /api/health` — health check

---

## Pipeline Versions

- **v1** — Binary PRIORITY REVIEW / STANDARD QUEUE. No provider label check.
- **v2** — Three-tier. Problem: original scans had triage NP's override notes visible.
- **v3** (`pipeline_results/v3_notriage/`) — Same prompt as v2, referrals rescanned with triage decisions covered. **Production scenario.** Primary evaluation dataset.

---

## Known Bug (Fixed in v3)

**Referral 06 action/reasoning mismatch:** JSON `action` field said "STANDARD QUEUE" but reasoning said "SECONDARY APPROVAL NEEDED."

**Fix:** Added to prompt — *"CRITICAL: The action field MUST match your reasoning. STANDARD QUEUE is ONLY for cases where no criteria matched AND the provider did NOT mark it urgent."*

This is a **safety requirement** — wrong action field silently drops urgent patients into the standard queue.

---

## HIPAA Compliance

**Every decision in this codebase must be evaluated against HIPAA requirements. When in doubt, the more restrictive choice applies.**

### What counts as PHI in this system
- Patient name, DOB, address, phone, email, SSN, MRN
- Any free-text in referral documents (the PDFs themselves)
- The `s3_key` field — it maps directly to a document containing PHI
- The `summary`, `referral_reason`, `reasoning`, and `relevant_clinical_findings` fields
- Anything in `audit_log.old_value` / `new_value` that captures referral content

### Encryption
- S3: AES-256 SSE enforced at bucket level — never disable
- RDS: encrypted at rest
- Transit: TLS 1.2+ everywhere — never allow HTTP in production
- `.env` contains secrets — never commit it, never log it

### AWS BAA Coverage
- AWS Bedrock, RDS, S3, Cognito, App Runner are all covered under the existing AWS BAA
- GPT-4o fallback in `classifier.py` is NOT BAA-covered — do not route real PHI through it

### Logging rules
- **Never log PHI** — structured logs contain only UUIDs, enums, timing, error codes
- The `s3_key` is sensitive — treat it like PHI in logs
- No PHI in error messages returned to clients

### Audit trail
- `audit_log` is append-only — never add UPDATE or DELETE routes for it
- HIPAA requires 6-year retention
- Every staff view, status change, or export must write an audit entry

### Authentication
- `get_current_user` in `app/dependencies.py` verifies Cognito JWTs and looks up the user by `auth_provider_id` (Cognito `sub`) in the `users` table
- Auth is real and live — Cognito JWT verification is implemented in `app/auth.py`

### Multi-clinic data isolation
- Every DB query on `referrals` and `audit_log` must filter by `clinic_id`
- `clinic_id` scoping must be derived from the authenticated user's JWT, not request parameters

### Pre-production checklist (must complete before real PHI)
- [x] Real JWT verification (Cognito) — implemented
- [x] RDS encryption at rest — enabled
- [x] ECS + Lambda deployment on ECR
- [x] Configure RDS to reject non-SSL connections — `rds.force_ssl=1` in custom param group `triageai-postgres16`, `sslmode=require` in all client URLs
- [x] HTTPS enforced — TLS 1.3 on ALB, HTTP→HTTPS redirect
- [x] ALLOWED_ORIGINS — N/A for Next.js Route Handlers (same-origin architecture; was a FastAPI concern only)
- [x] Enable RDS automated backups with 6-year retention — AWS Backup plan `triageai-hipaa-6yr`, vault `triageai-hipaa-vault`, 2190-day retention; RDS deletion protection enabled
- [ ] Set up CloudWatch log groups with no PHI logging policy
- [ ] Penetration test before go-live

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
