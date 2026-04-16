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
- **Backend complete** — FastAPI + PostgreSQL with full queue, detail, upload, status update, audit trail, and physician routing endpoints
- **Frontend complete** — Next.js multi-page queue (Priority / Secondary / Standard / In Pipeline) with per-tier views, urgency badges, filename display, 30s auto-refresh, and role-based UI
- **Physician routing** — coordinators route referrals to physicians via a modal picker; physicians have a dedicated My Queue + All Cases view
- **Auth live** — AWS Cognito (JWT, USER_PASSWORD_AUTH flow)
- **Fully deployed on AWS** — App Runner (frontend + backend), RDS, S3, Bedrock, Cognito
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
| LLM / OCR | Claude Sonnet 4.6 via AWS Bedrock (primary), GPT-4o fallback |
| Backend | FastAPI + Uvicorn → AWS App Runner |
| Frontend | Next.js 14 + Tailwind CSS → AWS App Runner |
| Database | PostgreSQL — AWS RDS (encrypted at rest) |
| Migrations | Alembic (runs on container startup) |
| Auth | AWS Cognito (USER_PASSWORD_AUTH, JWT) |
| Container registry | AWS ECR |
| Storage | AWS S3 (AES-256 SSE) |
| Fax ingestion | Phaxio / Documo (planned) |
| Demo UI | Streamlit |
| Encryption | AES-256 at rest, TLS 1.2+ in transit |
| Cloud | AWS — all services under existing AWS BAA |

---

## Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://md7czsu392.us-east-1.awsapprunner.com |
| Backend | https://3pkp9qp3ku.us-east-1.awsapprunner.com |
| API docs | https://3pkp9qp3ku.us-east-1.awsapprunner.com/docs |

---

## Quick Start (Local Development)

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (for local PostgreSQL)
- AWS credentials configured (for pipeline runs)

### Backend Setup

```bash
# Clone and enter the repo
git clone https://github.com/ayrabia/triageai.git
cd triageai

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
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

# Run migrations
alembic upgrade head

# Seed with de-identified test referrals
python scripts/seed.py

# Start the API
uvicorn app.main:app --reload
```

API docs at [http://localhost:8000/docs](http://localhost:8000/docs)

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Run the Streamlit Demo

```bash
streamlit run streamlit_demo/demo.py
```

### Share Locally via ngrok

ngrok lets you expose the local app to anyone with a URL — useful for demos without deploying.

**How it works:** The Next.js frontend proxies all `/api/*` calls to the FastAPI backend on localhost:8000 (via `next.config.mjs`). Only port 3000 needs to be tunneled.

```bash
# 1. Make sure both services are running (backend on :8000, frontend on :3000)

# 2. Tunnel the frontend — rewrite Host header so Next.js dev server accepts the ngrok domain
ngrok http --host-header=rewrite 3000
```

> **Note:** The ngrok URL is public while the tunnel is running. Do not run real patient data through a local demo session.

### Run Tests

```bash
pytest classifier/test_classifier.py -v
```

---

## Deploying to AWS

Both services run as Docker containers on AWS App Runner. ECR stores the images.

```bash
# Authenticate Docker with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 177884821405.dkr.ecr.us-east-1.amazonaws.com

# Build and push backend
docker build --platform linux/amd64 -t triageai-backend:latest .
docker tag triageai-backend:latest 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-backend:latest
docker push 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-backend:latest

# Build and push frontend (API_URL baked in at build time)
cd frontend
docker build --platform linux/amd64 \
  --build-arg API_URL=https://3pkp9qp3ku.us-east-1.awsapprunner.com \
  -t triageai-frontend:latest .
docker tag triageai-frontend:latest 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-frontend:latest
docker push 177884821405.dkr.ecr.us-east-1.amazonaws.com/triageai-frontend:latest
```

After pushing, trigger a new deployment from the App Runner console or via:

```bash
aws apprunner start-deployment \
  --service-arn <service-arn> \
  --region us-east-1
```

---

## Project Structure

```
triageai/
├── README.md
├── CLAUDE.md                              # AI context + HIPAA rules
├── requirements.txt
├── .env.example
├── Dockerfile                             # Backend container (FastAPI + poppler)
├── .dockerignore
│
├── db/
│   ├── enums.py                           # ReferralStatus, ReferralAction, UserRole
│   ├── models.py                          # SQLAlchemy ORM models
│   └── session.py                         # DB engine + get_db dependency
│
├── alembic/
│   ├── env.py
│   └── versions/
│       ├── 0001_initial_schema.py
│       ├── 0002_widen_recommended_window.py
│       └── 0003_add_filename.py
│
├── app/
│   ├── main.py                            # FastAPI entry point + CORS
│   ├── auth.py                            # Cognito JWT verification
│   ├── dependencies.py                    # get_db, get_current_user
│   └── routes/
│       ├── referrals.py                   # Queue, detail, upload, ingest, status, audit
│       ├── users.py                       # User management
│       └── health.py                      # GET /health
│
├── pipeline/
│   ├── pipeline_test_v2.py                # v3 pipeline script (active)
│   ├── run.py                             # Callable wrapper for background tasks
│   ├── ocr.py                             # AWS Textract wrapper
│   ├── nlp.py                             # AWS Comprehend Medical wrapper
│   └── missing_info.py                    # Rule-based missing field detection
│
├── frontend/
│   ├── Dockerfile                         # Next.js standalone container
│   ├── .dockerignore
│   ├── next.config.mjs                    # Standalone output + /api proxy
│   ├── app/
│   │   ├── page.tsx                       # Home dashboard — role-aware (coordinator vs physician)
│   │   ├── priority/page.tsx              # Priority Review queue
│   │   ├── secondary/page.tsx             # Secondary Approval queue
│   │   ├── standard/page.tsx              # Standard Queue
│   │   ├── pending/page.tsx               # In-pipeline / failed referrals
│   │   ├── my-queue/page.tsx              # Physician: referrals assigned to them
│   │   ├── all-cases/page.tsx             # Physician: all clinic referrals
│   │   ├── referrals/[id]/page.tsx        # Referral detail + PDF viewer
│   │   ├── login/page.tsx                 # Cognito login
│   │   └── api/                           # Next.js route handlers (Cognito proxy)
│   ├── components/
│   │   ├── TierQueue.tsx                  # Shared tier page component
│   │   ├── PendingQueue.tsx               # In-pipeline queue component
│   │   ├── QueueCard.tsx                  # Referral card (badge-first)
│   │   ├── RouteModal.tsx                 # Physician picker modal (coordinator use)
│   │   ├── ActionButtons.tsx              # Role-aware triage action buttons
│   │   ├── UploadZone.tsx                 # Drag-and-drop PDF upload
│   │   └── PriorityBadge.tsx
│   └── lib/
│       ├── api.ts                         # API client
│       ├── auth.ts                        # Cognito auth context
│       ├── types.ts                       # TypeScript types
│       └── utils.ts                       # ACTION_CONFIG, formatting
│
├── scripts/
│   └── seed.py                            # Load de-identified test referrals into DB
│
├── classifier/
│   ├── classifier.py                      # Core classifier
│   ├── prompts.py                         # ENT + specialty prompts
│   └── test_classifier.py                 # Pytest suite
│
├── evaluation/
│   ├── score.py                           # Precision/recall/F1 evaluation
│   └── results/                           # JSON metrics per eval run
│
├── streamlit_demo/
│   └── demo.py                            # Interactive demo UI
│
└── referrals/
    ├── Redacted_Referrals/                # 6 de-identified test referrals (R01–R06)
    └── Training_Redacted_Referrals/       # Training set used for v3 evaluation
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/referrals/ingest` | Accept new fax S3 key, kick off pipeline |
| `POST` | `/referrals/upload` | Direct PDF upload from UI |
| `GET` | `/referrals/` | Paginated queue sorted by priority tier (`assigned_to_me=true` for physician queue) |
| `GET` | `/referrals/{id}` | Full referral detail |
| `PATCH` | `/referrals/{id}/status` | Update status + write audit log |
| `POST` | `/referrals/{id}/route` | Route to a physician (COORDINATOR/ADMIN only) |
| `GET` | `/referrals/{id}/audit` | HIPAA audit trail |
| `GET` | `/referrals/{id}/pdf` | Short-lived presigned S3 URL for the PDF |
| `GET` | `/users/me` | Authenticated user profile + clinic info |
| `GET` | `/users/physicians` | List physicians at the caller's clinic |
| `GET` | `/health` | Health check |

---

## HIPAA Compliance

TriageAI is designed for HIPAA compliance from day one:

- PHI encrypted at rest (**AES-256**) and in transit (**TLS 1.2+**)
- AWS Bedrock used under **existing AWS BAA** — no separate agreement needed
- **No PHI in logs** — structured logs contain only UUIDs, enums, and timing
- **Append-only audit trail** with 6-year retention requirement
- Role-based access control per clinic (Auth0/Cognito — planned)
- Multi-clinic data isolation enforced at the query level
- GPT-4o fallback is **not BAA-covered** — do not route real PHI through it

> **Important:** TriageAI is an **administrative workflow tool**, not a clinical decision support system. The AI surfaces information — triage staff make all final decisions.

See `CLAUDE.md` for full HIPAA rules and pre-production checklist.

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
- [x] FastAPI backend (queue, detail, upload, ingest, audit endpoints)
- [x] Next.js frontend — per-tier pages, urgency-first cards, filename display, in-pipeline queue
- [x] Drag-and-drop PDF upload with live status tracking
- [x] AWS Cognito authentication (JWT)
- [x] AWS RDS production database (encrypted at rest)
- [x] Fully deployed on AWS App Runner (frontend + backend, no Vercel/Railway)
- [x] Seed script with de-identified test data
- [x] Streamlit demo
- [x] Physician role + referral routing workflow (coordinator routes → physician reviews)
- [ ] Clinical validation — Nadia Rabia (SacENT)
- [ ] Provision first physician account for end-to-end routing test
- [ ] Phaxio fax ingestion + S3 Lambda trigger
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
