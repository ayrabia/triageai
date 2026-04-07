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
- **Backend complete** — FastAPI + PostgreSQL with full queue, detail, status update, and audit trail endpoints
- **Frontend complete** — Next.js queue view + referral detail page with auto-refresh
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
| Backend | FastAPI + Uvicorn |
| Frontend | Next.js 14 + Tailwind CSS |
| Database | PostgreSQL (Docker locally, AWS RDS in production) |
| Migrations | Alembic |
| Fax ingestion | Phaxio / Documo (planned) |
| Auth | Auth0 / AWS Cognito (planned) |
| Demo UI | Streamlit |
| Encryption | AES-256 at rest, TLS 1.2+ in transit |
| Cloud | AWS (Bedrock, S3, Textract, RDS) — all under existing AWS BAA |

---

## Quick Start

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
cp .env.local.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Run the Streamlit Demo

```bash
streamlit run streamlit_demo/demo.py
```

### Share the Demo via ngrok

ngrok lets you expose the local app to anyone with a URL — useful for showing the queue to Nadia or other stakeholders without deploying.

**How it works:** The Next.js frontend proxies all `/api/*` calls to the FastAPI backend on localhost:8000 (via `next.config.mjs`). Only port 3000 needs to be tunneled — the backend never needs to be public-facing.

```bash
# 1. Make sure both services are running (backend on :8000, frontend on :3000)

# 2. Tunnel the frontend — rewrite the Host header so Next.js dev server accepts the ngrok domain
ngrok http --host-header=rewrite 3000
```

ngrok will print a forwarding URL like `https://abc123.ngrok-free.app`. Share that URL — it proxies through Next.js to the local FastAPI backend.

> **Note:** The ngrok URL is public while the tunnel is running. Only share it during active demos and stop the tunnel when done. Do not run real patient data through a local demo session.

### Run Tests

```bash
pytest classifier/test_classifier.py -v
```

---

## Project Structure

```
triageai/
├── README.md
├── CLAUDE.md                              # AI context + HIPAA rules
├── requirements.txt
├── .env.example
├── Procfile                               # Railway/Heroku deploy
├── runtime.txt                            # Python version
├── start.sh                               # Production startup script
│
├── db/
│   ├── enums.py                           # ReferralStatus, ReferralAction, UserRole
│   ├── models.py                          # SQLAlchemy ORM models
│   └── session.py                         # DB engine + get_db dependency
│
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 0001_initial_schema.py         # Full schema migration
│
├── app/
│   ├── main.py                            # FastAPI entry point
│   ├── dependencies.py                    # get_db, get_current_user
│   └── routes/
│       ├── referrals.py                   # Queue, detail, ingest, status, audit
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
│   ├── app/
│   │   ├── page.tsx                       # Queue view (auto-refreshes every 30s)
│   │   └── referrals/[id]/page.tsx        # Referral detail view
│   ├── components/
│   │   ├── QueueCard.tsx
│   │   ├── PriorityBadge.tsx
│   │   ├── ActionButtons.tsx
│   │   └── AutoRefresh.tsx
│   └── lib/
│       ├── api.ts                         # API client
│       ├── types.ts                       # TypeScript types
│       └── utils.ts                       # Formatting + color config
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
    ├── Redacted_Referrals/                # 8 de-identified test referrals
    └── Training_Redacted_Referrals/       # 7 training referrals (v3 evaluation set)
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/referrals/ingest` | Accept new fax S3 key, kick off pipeline |
| `GET` | `/referrals/` | Paginated queue sorted by priority tier |
| `GET` | `/referrals/{id}` | Full referral detail |
| `PATCH` | `/referrals/{id}/status` | Update status + write audit log |
| `GET` | `/referrals/{id}/audit` | HIPAA audit trail |
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
- [x] FastAPI backend (queue, detail, ingest, audit endpoints)
- [x] Next.js frontend with live queue + referral detail
- [x] Seed script with de-identified test data
- [x] Streamlit demo
- [ ] Clinical validation — Nadia Rabia (SacENT)
- [ ] Auth0 / AWS Cognito authentication
- [ ] Phaxio fax ingestion + S3 Lambda trigger
- [ ] AWS RDS production deployment
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
