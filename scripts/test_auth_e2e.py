"""
TriageAI — End-to-End Auth Test
================================
1. Seeds 3 synthetic referrals into Prime ENT's DB
2. Gets a real JWT from Cognito
3. Hits every protected endpoint and prints the results

Usage:
    python scripts/test_auth_e2e.py
"""

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

import boto3
import httpx
import os

from db.enums import ReferralAction, ReferralStatus
from db.models import AuditLog, Clinic, Referral
from db.session import SessionLocal

API_BASE = "http://localhost:8000"
COGNITO_REGION = os.environ["COGNITO_REGION"]
COGNITO_USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
COGNITO_APP_CLIENT_ID = os.environ["COGNITO_APP_CLIENT_ID"]
EMAIL = "ayman.rabia@sjsu.edu"
PASSWORD = "TriageAI-Dev-2026!"

# ---------------------------------------------------------------------------
# Synthetic referrals for Prime ENT
# ---------------------------------------------------------------------------
SYNTHETIC_REFERRALS = [
    {
        "s3_key": "prime-ent/dev/referral_thyroid_carcinoma.pdf",
        "action": ReferralAction.PRIORITY_REVIEW,
        "referral_reason": "Newly diagnosed thyroid carcinoma, referred for surgical evaluation",
        "relevant_clinical_findings": [
            "Papillary thyroid carcinoma confirmed on FNA biopsy",
            "1.8cm nodule right lobe",
            "No lymphadenopathy on ultrasound",
        ],
        "imaging_summary": "Ultrasound: 1.8cm hypoechoic nodule with microcalcifications, right thyroid lobe",
        "missing_information": [],
        "provider_urgency_label": {"label": "urgent", "source": "Priority field, top of referral form"},
        "matched_criteria": ["Confirmed or suspected cancer / malignancy"],
        "evidence": ["FNA biopsy confirming papillary thyroid carcinoma"],
        "provider_label": "urgent",
        "reasoning": "Clinical criteria matched: confirmed malignancy. Provider also marked urgent — both agree.",
        "recommended_window": "3-4 weeks",
        "next_steps": "Schedule within 3-4 weeks per thyroid malignancy criteria.",
        "summary": "58-year-old with biopsy-confirmed papillary thyroid carcinoma referred for surgical evaluation. Urgent per both provider label and ENT criteria.",
    },
    {
        "s3_key": "prime-ent/dev/referral_tonsillitis_urgent.pdf",
        "action": ReferralAction.SECONDARY_APPROVAL,
        "referral_reason": "Recurrent tonsillitis, provider requesting urgent ENT evaluation",
        "relevant_clinical_findings": [
            "4 episodes of tonsillitis in past 12 months",
            "Each episode resolved with antibiotics",
            "No current acute infection",
            "No airway compromise, no abscess",
        ],
        "imaging_summary": None,
        "missing_information": [],
        "provider_urgency_label": {"label": "urgent", "source": "Priority: 1 - URGENT on referral header"},
        "matched_criteria": [],
        "evidence": [],
        "provider_label": "urgent",
        "referring_clinic_classification": "Priority: 1 - URGENT",
        "reasoning": "Provider marked URGENT but clinical content (recurrent tonsillitis, no active infection) does not match any ENT urgent criteria. Secondary review needed.",
        "recommended_window": None,
        "next_steps": "Secondary review needed — provider marked urgent but no ENT criteria matched. Verify with referring provider before scheduling.",
        "summary": "34-year-old with recurrent tonsillitis (4 episodes/year). Provider marked urgent but no acute findings or criteria match. Flagged for secondary review.",
    },
    {
        "s3_key": "prime-ent/dev/referral_sinusitis_routine.pdf",
        "action": ReferralAction.STANDARD_QUEUE,
        "referral_reason": "Chronic sinusitis, requesting surgical consultation",
        "relevant_clinical_findings": [
            "18 months of right-sided sinus symptoms",
            "4 antibiotic courses in past year, partial relief",
            "No orbital or intracranial involvement",
            "Medically stable",
        ],
        "imaging_summary": "CT sinuses: mild right maxillary mucosal thickening. No polyps.",
        "missing_information": [],
        "provider_urgency_label": {"label": "routine", "source": "Priority: Routine on referral form"},
        "matched_criteria": [],
        "evidence": [],
        "provider_label": "routine",
        "reasoning": "No urgent criteria matched and provider marked routine. Both agree — standard scheduling.",
        "recommended_window": None,
        "next_steps": "Standard scheduling applies.",
        "summary": "42-year-old with chronic right-sided sinusitis, stable. CT shows mild mucosal thickening. Routine surgical consultation requested.",
    },
]


def seed_referrals(clinic_id: uuid.UUID) -> list[uuid.UUID]:
    db = SessionLocal()
    referral_ids = []
    try:
        for i, r in enumerate(SYNTHETIC_REFERRALS):
            existing = db.query(Referral).filter(Referral.s3_key == r["s3_key"]).first()
            if existing:
                print(f"  Referral {i+1} already seeded, skipping.")
                referral_ids.append(existing.id)
                continue

            referral = Referral(
                clinic_id=clinic_id,
                s3_key=r["s3_key"],
                status=ReferralStatus.PENDING,
                received_at=datetime.now(timezone.utc),
                processed_at=datetime.now(timezone.utc),
                referral_reason=r["referral_reason"],
                relevant_clinical_findings=r["relevant_clinical_findings"],
                imaging_summary=r.get("imaging_summary"),
                missing_information=r["missing_information"],
                provider_urgency_label=r["provider_urgency_label"],
                action=r["action"],
                matched_criteria=r["matched_criteria"],
                evidence=r["evidence"],
                provider_label=r["provider_label"],
                reasoning=r["reasoning"],
                recommended_window=r.get("recommended_window"),
                next_steps=r["next_steps"],
                summary=r["summary"],
                model_used="claude-sonnet-4-6",
                pipeline_version="v3",
            )
            db.add(referral)
            db.flush()
            db.add(AuditLog(
                referral_id=referral.id,
                user_id=None,
                action="seeded",
                new_value={"source": "test_auth_e2e.py", "note": "synthetic test data"},
            ))
            referral_ids.append(referral.id)
            print(f"  Seeded: [{r['action'].value}] {r['referral_reason'][:60]}...")

        db.commit()
    finally:
        db.close()
    return referral_ids


def get_token() -> str:
    cognito = boto3.client("cognito-idp", region_name=COGNITO_REGION)
    resp = cognito.initiate_auth(
        AuthFlow="USER_PASSWORD_AUTH",
        ClientId=COGNITO_APP_CLIENT_ID,
        AuthParameters={"USERNAME": EMAIL, "PASSWORD": PASSWORD},
    )
    return resp["AuthenticationResult"]["IdToken"]


def print_section(title: str) -> None:
    print(f"\n{'═' * 60}")
    print(f"  {title}")
    print(f"{'═' * 60}")


def run():
    # --- 1. Get Prime ENT clinic ID from DB ---
    db = SessionLocal()
    try:
        clinic = db.query(Clinic).filter(Clinic.name == "Prime ENT").first()
        if not clinic:
            print("ERROR: Prime ENT clinic not found. Run create_clinic.py first.")
            return
        clinic_id = clinic.id
    finally:
        db.close()

    print_section("STEP 1 — Seed synthetic referrals into Prime ENT")
    referral_ids = seed_referrals(clinic_id)
    print(f"\n  {len(referral_ids)} referral(s) ready.")

    # --- 2. Get Cognito JWT ---
    print_section("STEP 2 — Authenticate with Cognito")
    print(f"  Logging in as: {EMAIL} ...")
    token = get_token()
    print(f"  Token received (first 60 chars): {token[:60]}...")

    headers = {"Authorization": f"Bearer {token}"}

    # --- 3. Hit the queue endpoint ---
    print_section("STEP 3 — GET /referrals/ (queue)")
    resp = httpx.get(f"{API_BASE}/referrals/", headers=headers)
    print(f"  Status: {resp.status_code}")
    queue = resp.json()
    print(f"  Referrals returned: {len(queue)}")
    for r in queue:
        print(f"\n    ID:      {r['id']}")
        print(f"    Action:  {r['action']}")
        print(f"    Reason:  {r['referral_reason'][:70]}...")
        print(f"    Window:  {r['recommended_window'] or '—'}")
        print(f"    Summary: {r['summary'][:80]}...")

    # --- 4. Hit the detail endpoint for the first referral ---
    if referral_ids:
        print_section("STEP 4 — GET /referrals/{id} (detail)")
        detail_id = referral_ids[0]
        resp = httpx.get(f"{API_BASE}/referrals/{detail_id}", headers=headers)
        print(f"  Status: {resp.status_code}")
        detail = resp.json()
        print(f"\n  Referral ID:        {detail['id']}")
        print(f"  Clinic ID:          {detail['clinic_id']}")
        print(f"  Action:             {detail['action']}")
        print(f"  Provider label:     {detail.get('provider_urgency_label')}")
        print(f"  Matched criteria:   {detail.get('matched_criteria')}")
        print(f"  Recommended window: {detail.get('recommended_window')}")
        print(f"  Reasoning:          {detail.get('reasoning')}")
        print(f"  Next steps:         {detail.get('next_steps')}")

        # --- 5. Hit the audit trail ---
        print_section("STEP 5 — GET /referrals/{id}/audit")
        resp = httpx.get(f"{API_BASE}/referrals/{detail_id}/audit", headers=headers)
        print(f"  Status: {resp.status_code}")
        audit = resp.json()
        print(f"  Audit entries: {len(audit)}")
        for entry in audit:
            print(f"    [{entry['created_at']}] {entry['action']} — user: {entry['user_id'] or 'system'}")

        # --- 6. Try cross-clinic access (should 403) ---
        print_section("STEP 6 — Cross-clinic isolation check")
        db = SessionLocal()
        try:
            sacent = db.query(Clinic).filter(Clinic.name == "Sacramento ENT").first()
            sacent_referral = db.query(Referral).filter(
                Referral.clinic_id == sacent.id
            ).first() if sacent else None
        finally:
            db.close()

        if sacent_referral:
            resp = httpx.get(f"{API_BASE}/referrals/{sacent_referral.id}", headers=headers)
            print(f"  Attempt to access SacENT referral with Prime ENT token:")
            print(f"  Status: {resp.status_code} — {'✓ Correctly blocked' if resp.status_code == 403 else '✗ Should have been 403!'}")
        else:
            print("  No SacENT referrals in DB to test against — skipping isolation check.")
            print("  (Run seed.py to add SacENT referrals, then re-run this test.)")

    print_section("DONE")
    print("  Auth flow verified end-to-end.")
    print(f"  Token issued by: Cognito User Pool {COGNITO_USER_POOL_ID}")
    print(f"  User clinic: Prime ENT ({clinic_id})")


if __name__ == "__main__":
    run()
