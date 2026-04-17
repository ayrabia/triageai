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
- **Live at** [app.usetriageai.com](https://app.usetriageai.com)
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

## Production URL

**[https://app.usetriageai.com](https://app.usetriageai.com)**

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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Run Tests

```bash
pytest classifier/test_classifier.py -v
```

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
│   └── versions/                          # DB migration files
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
│   ├── next.config.mjs
│   ├── app/
│   │   ├── page.tsx                       # Home dashboard (role-aware)
│   │   ├── priority/page.tsx
│   │   ├── secondary/page.tsx
│   │   ├── standard/page.tsx
│   │   ├── pending/page.tsx               # In-pipeline / failed referrals
│   │   ├── my-queue/page.tsx              # Physician: assigned referrals
│   │   ├── all-cases/page.tsx             # Physician: all clinic referrals
│   │   ├── referrals/[id]/page.tsx        # Referral detail + PDF viewer
│   │   ├── login/page.tsx
│   │   └── api/                           # Route Handlers (all API endpoints)
│   │       ├── _lib/
│   │       │   ├── db.ts                  # postgres pool (lazy singleton)
│   │       │   └── auth.ts                # Cognito JWT + withAuth()
│   │       ├── referrals/
│   │       │   ├── route.ts               # GET queue
│   │       │   ├── upload/route.ts        # POST upload → S3 + DB
│   │       │   ├── ingest/route.ts        # POST pipeline callback
│   │       │   └── [id]/
│   │       │       ├── route.ts           # GET detail
│   │       │       ├── status/route.ts    # PATCH status
│   │       │       ├── route/route.ts     # POST route to physician
│   │       │       ├── pdf/route.ts       # GET presigned S3 URL
│   │       │       └── audit/route.ts     # GET audit trail
│   │       └── users/
│   │           ├── me/route.ts
│   │           └── physicians/route.ts
│   ├── components/
│   │   ├── TierQueue.tsx
│   │   ├── PendingQueue.tsx
│   │   ├── QueueCard.tsx
│   │   ├── RouteModal.tsx
│   │   ├── ActionButtons.tsx
│   │   └── UploadZone.tsx
│   └── lib/
│       ├── api.ts
│       ├── auth.ts
│       ├── types.ts
│       └── utils.ts
│
└── referrals/
    └── Redacted_Referrals/                # 6 de-identified test referrals (R01–R06)
```

---

## API Endpoints

All served by Next.js Route Handlers at `app.usetriageai.com/api/`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/referrals` | Paginated queue sorted by priority tier |
| `POST` | `/api/referrals/upload` | PDF upload → S3 + DB row |
| `POST` | `/api/referrals/ingest` | Pipeline callback (PIPELINE_SECRET auth) |
| `GET` | `/api/referrals/[id]` | Full referral detail + audit log write |
| `PATCH` | `/api/referrals/[id]/status` | Status transition |
| `POST` | `/api/referrals/[id]/route` | Route to physician (coordinator/admin only) |
| `GET` | `/api/referrals/[id]/pdf` | Presigned S3 URL (5 min TTL) |
| `GET` | `/api/referrals/[id]/audit` | HIPAA audit trail |
| `GET` | `/api/users/me` | Authenticated user profile |
| `GET` | `/api/users/physicians` | Physicians at caller's clinic |
| `GET` | `/api/health` | Health check |

---

## HIPAA Compliance

TriageAI is designed for HIPAA compliance from day one:

- PHI encrypted at rest (**AES-256**) and in transit (**TLS 1.3**)
- AWS Bedrock used under **existing AWS BAA** — no separate agreement needed
- **No PHI in logs** — structured logs contain only UUIDs, enums, and timing
- **Append-only audit trail** — every view, status change, and PDF access is logged
- **6-year backup retention** via AWS Backup (HIPAA requirement)
- **RDS SSL enforced** — `rds.force_ssl=1`, all clients use `sslmode=require`
- Role-based access control — ADMIN, COORDINATOR, PHYSICIAN roles
- Multi-clinic data isolation enforced at the query level (`clinic_id` scoping)

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
- [x] Next.js Route Handlers — full API (queue, upload, detail, status, routing, audit, PDF)
- [x] Next.js frontend — per-tier pages, urgency-first cards, filename display, in-pipeline queue
- [x] Drag-and-drop PDF upload with live status tracking
- [x] AWS Cognito authentication (JWT)
- [x] AWS RDS production database (encrypted at rest, SSL enforced)
- [x] Lambda pipeline — S3 trigger, automatic classification on upload
- [x] ECS Fargate + ALB — live at app.usetriageai.com (HTTPS, TLS 1.3)
- [x] Physician role + referral routing workflow
- [x] 6-year HIPAA backup retention (AWS Backup)
- [ ] Clinical validation — Nadia Rabia (SacENT)
- [ ] Provision first physician account for end-to-end routing test
- [ ] Phaxio fax ingestion
- [ ] Cardiology specialty criteria
- [ ] Orthopedics specialty criteria
- [ ] Multi-clinic onboarding

---

## Target Customer

- **Who:** 1–10 provider specialty clinics (ENT, Cardiology, Orthopedics, Neurology, GI)
- **Buyer:** Practice manager or physician board
- **Price:** $200–$350 per provider per month
- **Setup:** Self-serve, no EHR integration required at launch

---

*Built with care for the patients waiting in the pile.*
