# TriageAI

![Status](https://img.shields.io/badge/Status-Pre--Seed%20%2F%20Prototype%20Built-blue)
![Python](https://img.shields.io/badge/Python-3.11+-blue)
![License](https://img.shields.io/badge/License-Proprietary-red)
![HIPAA](https://img.shields.io/badge/HIPAA-Compliant%20Design-green)

> **AI-powered referral triage for specialty clinics.**
> Stop drowning in unnamed fax documents. Surface urgent patients before they fall through the cracks.

---

## The Problem

Specialty clinics are buried under referral backlogs — and the consequences are clinical.

| Metric | Reality |
|--------|---------|
| Referrals per day (5-location ENT clinic) | 150+ |
| Current backlog | 4,000+ referrals (30+ days behind) |
| Referral expiry window | ~100 days |
| Referrals that never complete care | ~50% |
| Revenue lost per physician per year | $821K–$971K |
| Time spent on manual triage | 3–4 hours per person per day |

Every fax arrives named only by its fax number. Staff click through each document one by one with no idea what's inside. A suspected cancer diagnosis sits in the same undifferentiated pile as a routine follow-up.

**This is an administrative workflow failure, not a clinical one. We fix the workflow.**

---

## The Solution

TriageAI ingests faxed referrals, extracts clinical information using Claude via AWS Bedrock, and classifies each one into a three-tier priority system. Staff see a **prioritized queue** instead of a pile of unnamed documents.

### Three-Tier Classification

| Tier | When it fires |
|------|--------------|
| **PRIORITY REVIEW** | Clinical content matches urgent criteria — regardless of provider label |
| **SECONDARY APPROVAL** | Provider marked urgent/STAT but no clinical criteria matched — never silently downgrade |
| **STANDARD QUEUE** | No criteria matched AND provider did not mark urgent (both agree it's routine) |

**Safety principle:** STANDARD QUEUE only fires when both clinical content AND provider label agree it's routine.

---

## Current Status (April 2026)

- **POC validated** on 6 real de-identified ENT referrals from Sacramento ENT — 0 missed urgents, 0 silent downgrades
- **Fully deployed on AWS** — ECS Fargate (frontend) + Lambda (pipeline), RDS, S3, Bedrock, Cognito
- **Clinic portals live** — each clinic gets its own subdomain (e.g. `sacent.usetriageai.com`) with isolated auth enforcement
- **Full role system implemented** — COORDINATOR, REVIEWER, PHYSICIAN, ADMIN with a complete scheduling workflow
- **Awaiting clinical validation** from Nadia Rabia (Referral Coordinator, SacENT)
- Pre-seed / concept stage

### v3 Evaluation Results

| Referral | Condition | Classification |
|---|---|---|
| R01 | Thyroid carcinoma | PRIORITY REVIEW ✓ |
| R02 | Tinnitus/hearing loss | SECONDARY APPROVAL ✓ |
| R03 | Tongue base mass (suspected SCC) | PRIORITY REVIEW ✓ |
| R04 | Nasal fracture (delayed healing) | PRIORITY REVIEW ✓ |
| R05 | Tonsillar cyst/polyp | SECONDARY APPROVAL ✓ |
| R06 | Pediatric recurrent otitis media | SECONDARY APPROVAL ✓ (after bug fix) |

---

## Role System

TriageAI maps directly to how specialty clinic triage teams actually work:

| Role | Who | What they do |
|------|-----|-------------|
| **COORDINATOR** | Scheduling staff | Upload referrals from the fax folder; confirm scheduling once a window is set |
| **REVIEWER** | APPs + Clinical Managers | Review AI-classified referrals; approve for scheduling (with window) or escalate to MD |
| **PHYSICIAN** | MD on triage rotation | Receive escalated high-acuity cases; set scheduling window + clinical decision notes |
| **ADMIN** | System admin | Full access across all views and actions |

### Permissions

| Ability | COORDINATOR | REVIEWER | PHYSICIAN | ADMIN |
|---------|:-----------:|:--------:|:---------:|:-----:|
| Upload referral PDFs | ✓ | | | ✓ |
| View Priority queue | | ✓ | | ✓ |
| View Secondary queue | | ✓ | | ✓ |
| View Standard queue | | ✓ | | ✓ |
| Approve referral for scheduling (set window) | | ✓ | | ✓ |
| Escalate referral to MD (Priority Review only) | | ✓ | | ✓ |
| View My Queue (escalated referrals assigned to me) | | | ✓ | |
| View All Cases | | | ✓ | ✓ |
| Submit MD decision (scheduling window + clinical note) | | | ✓ | ✓ |
| Confirm referral as scheduled | ✓ | | | ✓ |
| View Scheduling Inbox (approved, awaiting confirmation) | ✓ | | | ✓ |
| Archive / dismiss failed referrals | ✓ | ✓ | ✓ | ✓ |
| View audit trail | ✓ | ✓ | ✓ | ✓ |
| View referral detail + PDF | ✓ | ✓ | ✓ | ✓ |
| Full access across all views and actions | | | | ✓ |

### Workflow

```
Fax arrives → COORDINATOR uploads PDF
  → AI classifies (PRIORITY / SECONDARY / STANDARD)
  → REVIEWER triages:
      Standard/Secondary → pick window → Approve for Scheduling → COORDINATOR confirms
      Priority Review    → Escalate to MD
        → PHYSICIAN reviews → sets window + note → MD decision returned
          → REVIEWER sends to scheduler → COORDINATOR confirms
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| LLM | Claude Sonnet 4.6 via AWS Bedrock |
| Pipeline | AWS Lambda (container image, S3 trigger) |
| Frontend | Next.js 14 + Tailwind CSS → ECS Fargate behind ALB |
| API | Next.js Route Handlers (co-located with frontend, no separate backend) |
| Database | PostgreSQL — AWS RDS (encrypted at rest, SSL enforced) |
| Migrations | Alembic |
| Auth | AWS Cognito (USER_PASSWORD_AUTH, JWT) |
| Container registry | AWS ECR |
| Storage | AWS S3 (AES-256 SSE) |
| Backups | AWS Backup — 6-year retention (HIPAA) |
| Fax ingestion | Phaxio / Documo (planned) |
| Encryption | AES-256 at rest, TLS 1.3 in transit |
| Cloud | AWS — all services under existing AWS BAA |

---

## Production URLs

| Subdomain | Purpose |
|-----------|---------|
| `sacent.usetriageai.com` | Sacramento ENT clinic portal |
| `{slug}.usetriageai.com` | Any future clinic — DNS wildcard already live |
| `app.usetriageai.com` | Redirects to `/clinic-portal` (use your clinic's subdomain) |

---

## Quick Start (Local Development)

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (for local PostgreSQL)
- AWS credentials configured

### Pipeline Setup

```bash
git clone https://github.com/ayrabia/triageai.git
cd triageai

python -m venv venv
source venv/bin/activate
pip install -r requirements-lambda.txt

cp .env.example .env
# Edit .env — set DATABASE_URL and AWS credentials

# Start local PostgreSQL
docker run -d \
  --name triageai-pg \
  -e POSTGRES_USER=triageai \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=triageai \
  -p 5432:5432 \
  postgres:16

alembic upgrade head
```

### Frontend Setup

```bash
cd frontend
npm install
# Create frontend/.env.local with:
#   DATABASE_URL=postgresql://triageai:password@localhost:5432/triageai
#   COGNITO_USER_POOL_ID=us-east-1_B5EPFtIfW
#   COGNITO_APP_CLIENT_ID=5ln3morakigit80ae0m8i295qb
#   NEXT_PUBLIC_COGNITO_REGION=us-east-1
#   NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=5ln3morakigit80ae0m8i295qb
#   PIPELINE_SECRET=<secret>
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploying to AWS

### Frontend (ECS Fargate)

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 177884821405.dkr.ecr.us-east-1.amazonaws.com

cd frontend
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_COGNITO_REGION=us-east-1 \
  --build-arg NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=5ln3morakigit80ae0m8i295qb \
  -t 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-frontend:latest .
docker push 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-frontend:latest

aws ecs update-service --cluster triageai --service triageai-frontend \
  --force-new-deployment --region us-east-1
```

### Pipeline (Lambda)

```bash
# Must use --provenance=false — Lambda rejects OCI manifest lists from buildx
docker build --platform linux/amd64 --provenance=false --sbom=false \
  -t 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-pipeline:latest \
  -f lambda/Dockerfile .
docker push 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-pipeline:latest

aws lambda update-function-code \
  --function-name triageai-pipeline \
  --image-uri 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-pipeline:latest \
  --region us-east-1
```

---

## Project Structure

```
triageai/
├── README.md
├── CLAUDE.md                              # AI context + HIPAA rules
├── requirements-lambda.txt                # Lambda Python deps
├── lambda/
│   ├── Dockerfile                         # Lambda container (python:3.11-slim + poppler)
│   └── handler.py                         # S3 event handler — Lambda entry point
│
├── db/
│   ├── enums.py                           # ReferralStatus, ReferralAction, UserRole
│   ├── models.py                          # SQLAlchemy ORM models
│   └── session.py                         # DB engine + session factory
│
├── alembic/
│   └── versions/                          # DB migration files (0001–0005)
│
├── pipeline/
│   ├── run.py                             # process_referral() — called by Lambda
│   ├── ocr.py
│   ├── nlp.py
│   └── missing_info.py
│
├── classifier/
│   ├── classifier.py                      # Core LLM classifier
│   ├── prompts.py                         # ENT + specialty prompts
│   └── criteria.py                        # ENT urgent criteria
│
├── frontend/
│   ├── Dockerfile                         # Next.js standalone container
│   ├── middleware.ts                       # Subdomain → x-clinic-slug header
│   ├── next.config.mjs
│   ├── app/
│   │   ├── page.tsx                       # Home dashboard (role-aware)
│   │   ├── priority/page.tsx
│   │   ├── secondary/page.tsx
│   │   ├── standard/page.tsx
│   │   ├── pending/page.tsx               # In-pipeline / failed referrals
│   │   ├── scheduling-inbox/page.tsx      # COORDINATOR: ready-to-schedule list
│   │   ├── clinic-portal/page.tsx         # app. subdomain redirect target
│   │   ├── my-queue/page.tsx              # Physician: escalated referrals
│   │   ├── all-cases/page.tsx             # Physician: all clinic referrals
│   │   ├── referrals/[id]/page.tsx        # Referral detail + PDF viewer + MD panel
│   │   ├── login/page.tsx
│   │   └── api/                           # Route Handlers (all API endpoints)
│   │       ├── _lib/
│   │       │   ├── db.ts                  # postgres pool (lazy singleton)
│   │       │   └── auth.ts                # Cognito JWT + withAuth() + clinic isolation
│   │       ├── referrals/
│   │       │   ├── route.ts               # GET queue
│   │       │   ├── upload/route.ts        # POST upload → S3 + DB
│   │       │   ├── ingest/route.ts        # POST pipeline callback
│   │       │   └── [id]/
│   │       │       ├── route.ts           # GET detail
│   │       │       ├── status/route.ts    # PATCH status transitions
│   │       │       ├── route/route.ts     # POST escalate to MD (REVIEWER)
│   │       │       ├── respond/route.ts   # POST MD decision (PHYSICIAN)
│   │       │       ├── pdf/route.ts       # GET presigned S3 URL
│   │       │       └── audit/route.ts     # GET audit trail
│   │       └── users/
│   │           ├── me/route.ts
│   │           └── physicians/route.ts
│   ├── components/
│   │   ├── TierQueue.tsx
│   │   ├── PendingQueue.tsx
│   │   ├── QueueCard.tsx
│   │   ├── RouteModal.tsx                 # Physician selection modal (REVIEWER escalation)
│   │   ├── ActionButtons.tsx              # Role-aware triage actions
│   │   ├── PhysicianResponsePanel.tsx     # MD decision form
│   │   └── UploadZone.tsx
│   └── lib/
│       ├── api.ts
│       ├── auth.tsx
│       ├── types.ts
│       └── utils.ts
│
└── referrals/
    └── Redacted_Referrals/                # 6 de-identified test referrals (R01–R06)
```

---

## API Endpoints

All served by Next.js Route Handlers at `{clinic}.usetriageai.com/api/`:

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/referrals` | Any | Paginated queue sorted by priority tier |
| `POST` | `/api/referrals/upload` | Any | PDF upload → S3 + DB row |
| `POST` | `/api/referrals/ingest` | PIPELINE_SECRET | Pipeline callback |
| `GET` | `/api/referrals/[id]` | Any | Full referral detail + audit log write |
| `PATCH` | `/api/referrals/[id]/status` | Any | Status transition |
| `POST` | `/api/referrals/[id]/route` | REVIEWER / ADMIN | Escalate to MD (physician selection) |
| `POST` | `/api/referrals/[id]/respond` | PHYSICIAN / ADMIN | MD decision (window + note) |
| `GET` | `/api/referrals/[id]/pdf` | Any | Presigned S3 URL (5 min TTL) |
| `GET` | `/api/referrals/[id]/audit` | Any | HIPAA audit trail |
| `GET` | `/api/users/me` | Any | Authenticated user profile |
| `GET` | `/api/users/physicians` | Any | Physicians at caller's clinic |
| `GET` | `/api/health` | None | Health check |

---

## Pre-Production Blockers (Required Before Real PHI)

The following must be completed before any real patient data is processed:

| Blocker | Status | Notes |
|---------|--------|-------|
| CloudWatch no-PHI logging policy | ⛔ Open | Log groups need an explicit policy preventing PHI from appearing in CloudWatch. Structured logs currently emit only UUIDs/enums, but a formal policy must be attached to the log groups before go-live. |
| Penetration test | ⛔ Open | Full external pentest required before processing real patient data. Must cover auth bypass, subdomain isolation, S3 access, and API authorization boundaries. |

> These are hard blockers — **do not process real PHI until both are resolved.**

---

## HIPAA Compliance

TriageAI is designed for HIPAA compliance from day one:

- PHI encrypted at rest (**AES-256**) and in transit (**TLS 1.3**)
- AWS Bedrock used under **existing AWS BAA** — no separate agreement needed
- **No PHI in logs** — structured logs contain only UUIDs, enums, and timing
- **Append-only audit trail** — every view, status change, and PDF access is logged
- **6-year backup retention** via AWS Backup (HIPAA requirement)
- **RDS SSL enforced** — `rds.force_ssl=1`, all clients use `sslmode=require`
- Role-based access control — COORDINATOR, REVIEWER, PHYSICIAN, ADMIN
- Multi-clinic data isolation enforced at query level (`clinic_id` scoping) and subdomain level (`x-clinic-slug` middleware)

> **Important:** TriageAI is an **administrative workflow tool**, not a clinical decision support system. The AI surfaces information — triage staff make all final decisions.

---

## Competitor Comparison

| Feature | Tennr | **TriageAI** |
|---------|-------|--------------|
| Target customer | Large health systems | **1–10 provider specialty clinics** |
| EHR integration required | Yes | **No — self-serve** |
| Urgency triage | No | **Yes — core feature** |
| Specialty-specific criteria | No | **Yes (ENT validated, others planned)** |
| Missing info detection | Partial | **Yes — with callback prompts** |
| Setup time | Weeks–months | **Days** |
| Pricing | Enterprise contract | **$200–$350/provider/month** |
| HIPAA compliant | Yes | **Yes** |

---

## Roadmap

- [x] Core urgency classifier (Claude via Bedrock)
- [x] Three-tier classification (Priority / Secondary / Standard)
- [x] v3 pipeline validated on 6 de-identified ENT referrals
- [x] PostgreSQL schema + Alembic migrations
- [x] Next.js Route Handlers — full API
- [x] Next.js frontend — per-tier pages, urgency-first cards, in-pipeline queue
- [x] Drag-and-drop PDF upload with live status tracking
- [x] AWS Cognito authentication (JWT)
- [x] AWS RDS production database (encrypted at rest, SSL enforced)
- [x] Lambda pipeline — S3 trigger, automatic classification on upload
- [x] ECS Fargate + ALB — HTTPS, TLS 1.3
- [x] 6-year HIPAA backup retention (AWS Backup)
- [x] Subdomain-based clinic portals with auth isolation (`sacent.usetriageai.com`)
- [x] Full role system — COORDINATOR, REVIEWER, PHYSICIAN, ADMIN
- [x] Complete scheduling workflow — escalation → MD decision → scheduler → confirmed
- [ ] Clinical validation — Nadia Rabia (SacENT)
- [ ] Phaxio fax ingestion
- [ ] Clinic branding on portal login page
- [ ] Clinic onboarding automation (currently manual)
- [ ] CloudWatch no-PHI logging policy
- [ ] Penetration test before go-live with real PHI
- [ ] Cardiology specialty criteria
- [ ] Orthopedics specialty criteria

---

## Target Customer

- **Who:** 1–10 provider specialty clinics (ENT, Cardiology, Orthopedics, Neurology, GI)
- **Buyer:** Practice manager or physician board
- **Price:** $200–$350 per provider per month
- **Setup:** Self-serve, no EHR integration required at launch

---

*Built with care for the patients waiting in the pile.*
