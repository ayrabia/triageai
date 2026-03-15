# TriageAI

![Status](https://img.shields.io/badge/Status-Pre--Seed%20%2F%20Concept%20Stage-orange)
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
| Physician burnout rotation | Monthly, just to prevent burnout |

Every fax arrives named only by its fax number. Staff click through each document one by one with no idea what's inside. A suspected cancer diagnosis sits in the same undifferentiated pile as a routine follow-up. Urgent patients — nasal fractures with a 1–2 week surgical window, infants with tongue ties unable to feed — wait.

**This is an administrative workflow failure, not a clinical one. We fix the workflow.**

---

## The Solution

TriageAI ingests faxed referrals, extracts clinical information, and classifies each one as **URGENT**, **ROUTINE**, or **NEEDS REVIEW** — with a plain-language reason and the extracted keywords used to make the decision.

Staff see a **prioritized queue** instead of a pile of unnamed documents.

```
┌─────────────────────────────────────────────────────────────┐
│  Referral Queue — ENT Clinic                    150 today   │
├──────┬──────────────────────────────┬───────────┬───────────┤
│  ID  │  Summary                     │  Priority │  Age      │
├──────┼──────────────────────────────┼───────────┼───────────┤
│ 1042 │ Rapidly growing neck mass    │ 🔴 URGENT │  2 hrs    │
│ 1039 │ Suspected oral carcinoma     │ 🔴 URGENT │  4 hrs    │
│ 1051 │ Nasal fracture — 10 days ago │ 🔴 URGENT │  1 hr     │
│ 1044 │ Infant tongue tie, feeding ↓ │ 🔴 URGENT │  3 hrs    │
│ 1038 │ [Missing imaging, no notes]  │ 🟡 REVIEW │  5 hrs    │
│ 1033 │ Hearing loss, child, stable  │ 🟢 ROUTINE│  8 hrs    │
└──────┴──────────────────────────────┴───────────┴───────────┘
```

### Classification Output

Each referral returns:

```json
{
  "classification": "URGENT",
  "reason": "Referral describes a rapidly growing neck mass with 3-week progression. Suspected malignancy requires prompt evaluation.",
  "extracted_keywords": ["rapidly growing neck mass", "3-week progression", "firm on palpation", "no prior imaging"],
  "confidence": 0.94,
  "missing_info": ["CT neck with contrast", "lab results"]
}
```

---

## Competitor Comparison

| Feature | Tennr | **TriageAI** |
|---------|-------|--------------|
| Target customer | Large health systems | **1–10 provider specialty clinics** |
| EHR integration required | Yes | **No — self-serve** |
| Urgency triage | No | **Yes — core feature** |
| Specialty-specific criteria | No | **Yes (ENT, Cardiology, Ortho, Neuro, GI)** |
| Missing info detection | Partial | **Yes — with callback prompts** |
| Setup time | Weeks–months | **Days** |
| Pricing | Enterprise contract | **$200–$350/provider/month** |
| HIPAA compliant | Yes | **Yes** |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Fax ingestion | Phaxio / Documo API (HIPAA-compliant) |
| OCR | AWS Textract |
| Medical NLP | AWS Comprehend Medical |
| Urgency classifier | Claude API (claude-sonnet-4-20250514) |
| Backend | Python / FastAPI |
| Frontend | React + Tailwind CSS |
| Demo UI | Streamlit |
| Database | PostgreSQL (AWS RDS) |
| Auth | Auth0 / AWS Cognito |
| Encryption | AES-256 at rest, TLS 1.2+ in transit |

---

## Quick Start

### Prerequisites

- Python 3.11+
- An Anthropic API key (or OpenAI API key as fallback)

### Setup

```bash
# Clone the repo
git clone https://github.com/ayrabia/triageai.git
cd triageai

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Run the Streamlit Demo

```bash
streamlit run streamlit_demo/demo.py
```

Open [http://localhost:8501](http://localhost:8501) — paste a referral or click a one-click example.

### Run the FastAPI Backend

```bash
uvicorn app.main:app --reload
```

API docs at [http://localhost:8000/docs](http://localhost:8000/docs)

### Run Tests

```bash
pytest classifier/test_classifier.py -v
```

---

## Project Structure

```
triageai/
├── README.md                          # This file
├── .gitignore
├── requirements.txt
├── .env.example                       # Environment variable template
├── classifier/
│   ├── classifier.py                  # Core urgency classifier (Claude API)
│   ├── prompts.py                     # Prompt templates per specialty
│   └── test_classifier.py             # Unit tests with synthetic referrals
├── pipeline/
│   ├── ocr.py                         # AWS Textract wrapper
│   ├── nlp.py                         # AWS Comprehend Medical wrapper
│   └── missing_info.py                # Missing info detection per specialty
├── app/
│   ├── main.py                        # FastAPI app entry point
│   └── routes/
│       ├── referrals.py               # POST /referrals
│       └── health.py                  # GET /health
├── streamlit_demo/
│   └── demo.py                        # Streamlit demo UI
├── data/
│   └── synthetic_referrals.json       # 20 synthetic ENT referrals for testing
└── docs/
    └── urgency_criteria.md            # ENT urgency criteria documentation
```

---

## HIPAA Compliance

TriageAI is designed for HIPAA compliance from day one:

- All PHI encrypted at rest using **AES-256**
- All data in transit encrypted via **TLS 1.2+**
- Fax ingestion via **HIPAA-compliant BAA partners** (Phaxio / Documo)
- AWS services used under **AWS BAA coverage** (Textract, Comprehend Medical, RDS)
- No PHI stored in logs
- Role-based access control per clinic
- Audit trail for all classification events

> **Important:** TriageAI is an **administrative workflow tool**, not a clinical decision support system. The AI surfaces information and suggests a priority — the clinician makes all final decisions. Nothing in this system constitutes medical advice.

---

## Urgency Criteria (ENT)

See [`docs/urgency_criteria.md`](docs/urgency_criteria.md) for full criteria.

**URGENT**
- Confirmed cancer diagnoses
- Suspicious or rapidly growing oral or neck lesions
- Tongue ties in infants with feeding issues
- Nasal fractures (narrow 1–2 week surgical window)

**ROUTINE**
- Non-growing oral lesions in random areas
- Hearing loss in children (non-urgent)

**NEEDS REVIEW**
- Missing CT/MRI imaging
- Missing labs
- No clinical notes (authorization only)
- No referring physician contact info

---

## Roadmap

- [x] Core urgency classifier (Claude API)
- [x] Streamlit demo
- [x] Synthetic test data (ENT)
- [x] Missing info detection
- [ ] Phaxio fax ingestion integration
- [ ] AWS Textract OCR pipeline
- [ ] AWS Comprehend Medical NLP pipeline
- [ ] FastAPI production backend
- [ ] React + Tailwind frontend
- [ ] PostgreSQL persistence
- [ ] Auth0 authentication
- [ ] Cardiology specialty criteria
- [ ] Orthopedics specialty criteria
- [ ] Multi-clinic tenant isolation

---

## Target Customer

- **Who:** 1–10 provider specialty clinics (ENT, Cardiology, Orthopedics, Neurology, GI)
- **Buyer:** Practice manager or physician board
- **Price:** $200–$350 per provider per month
- **Setup:** Self-serve, no EHR integration required at launch

---

*Built with care for the patients waiting in the pile.*
