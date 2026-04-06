"""
TriageAI — Local Development Seed Script
=========================================
Loads the 6 de-identified v3 Training_Referral results into the local
development database so the API and frontend have real data to work with.

HIPAA NOTICE:
  - This script uses DE-IDENTIFIED test data only. No real PHI.
  - NEVER run this against a production database.
  - The s3_key values are fake (dev/test/ prefix) — they do not point to
    real patient documents.
  - This script is for local development only.

Usage:
    source venv/bin/activate
    python scripts/seed.py
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

from db.enums import ReferralAction, ReferralStatus, UserRole
from db.models import AuditLog, Clinic, Referral, User
from db.session import SessionLocal

V3_RESULTS_DIR = Path(__file__).resolve().parents[1] / "pipeline/pipeline_results/v3_notriage"
REDACTED_PDF_DIR = Path(__file__).resolve().parents[1] / "referrals/Training_Redacted_Referrals"

# Maps Claude's exact action string → ReferralAction enum
ACTION_MAP = {
    "FLAGGED FOR PRIORITY REVIEW": ReferralAction.PRIORITY_REVIEW,
    "SECONDARY APPROVAL NEEDED": ReferralAction.SECONDARY_APPROVAL,
    "STANDARD QUEUE": ReferralAction.STANDARD_QUEUE,
}


def seed():
    db = SessionLocal()
    try:
        # --- 1. Create SacENT clinic (idempotent) ---
        clinic = db.query(Clinic).filter(Clinic.name == "Sacramento ENT").first()
        if not clinic:
            clinic = Clinic(
                id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
                name="Sacramento ENT",
                specialty="ENT",
            )
            db.add(clinic)
            db.flush()
            print("Created clinic: Sacramento ENT")
        else:
            print("Clinic already exists, skipping.")

        # --- 2. Create a test coordinator user (idempotent) ---
        user = db.query(User).filter(User.email == "coordinator@sacent.dev").first()
        if not user:
            user = User(
                id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
                clinic_id=clinic.id,
                auth_provider_id="dev|coordinator",
                role=UserRole.COORDINATOR,
                name="Test Coordinator",
                email="coordinator@sacent.dev",
            )
            db.add(user)
            db.flush()
            print("Created user: coordinator@sacent.dev")
        else:
            print("User already exists, skipping.")

        # --- 3. Load v3 referral results ---
        result_files = sorted(V3_RESULTS_DIR.glob("*.json"))
        if not result_files:
            print(f"ERROR: No JSON files found in {V3_RESULTS_DIR}")
            return

        loaded = 0
        for result_file in result_files:
            with open(result_file) as f:
                data = json.load(f)

            cv = data.get("claude_vision", {})
            cc = cv.get("criteria_check", {})
            action_str = cc.get("action", "")

            # Derive the redacted PDF filename from the result filename
            # e.g. Training_Referral01_results.json → Training_Referral01.pdf
            pdf_stem = result_file.stem.replace("_results", "")
            pdf_filename = f"{pdf_stem}.pdf"

            # Verify the redacted PDF actually exists locally before seeding
            local_pdf = REDACTED_PDF_DIR / pdf_filename
            if not local_pdf.exists():
                print(f"  WARNING: Redacted PDF not found at {local_pdf} — skipping {result_file.name}")
                continue

            # S3 key uses dev/redacted/ prefix — clearly identifies test data origin
            s3_key = f"dev/redacted/{pdf_filename}"

            # Check if already seeded (by s3_key)
            existing = db.query(Referral).filter(Referral.s3_key == s3_key).first()
            if existing:
                print(f"  {result_file.name}: already seeded, skipping.")
                continue

            # Parse the pipeline timestamp
            ts_str = data.get("timestamp", "")
            try:
                received_at = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S").replace(
                    tzinfo=timezone.utc
                )
            except (ValueError, TypeError):
                received_at = datetime.now(timezone.utc)

            referral = Referral(
                clinic_id=clinic.id,
                s3_key=s3_key,
                status=ReferralStatus.PENDING,
                received_at=received_at,
                processed_at=received_at,

                # Extraction fields
                referral_reason=cv.get("referral_reason"),
                relevant_clinical_findings=cv.get("relevant_clinical_findings"),
                imaging_summary=cv.get("imaging_summary"),
                missing_information=cv.get("missing_information"),
                provider_urgency_label=cv.get("provider_urgency_label"),

                # Classification fields
                action=ACTION_MAP.get(action_str),
                matched_criteria=cc.get("matched_criteria"),
                evidence=cc.get("evidence"),
                provider_label=cc.get("provider_label"),
                reasoning=cc.get("reasoning"),
                recommended_window=cc.get("recommended_window"),

                # Coordinator-facing fields
                next_steps=cv.get("next_steps"),
                summary=cv.get("summary"),

                # Processing metadata
                model_used=os.environ.get("CLAUDE_MODEL_ID", "us.anthropic.claude-sonnet-4-6"),
                pipeline_version=data.get("pipeline_version", "v3"),
            )
            db.add(referral)
            db.flush()

            # Audit log entry — system ingestion event
            db.add(AuditLog(
                referral_id=referral.id,
                user_id=None,  # system event
                action="seeded",
                new_value={
                    "source": result_file.name,
                    "action": action_str,
                    "note": "de-identified test data, local dev only",
                },
            ))

            action_label = ACTION_MAP.get(action_str, action_str)
            print(f"  {result_file.name}: {action_label.value if hasattr(action_label, 'value') else action_str}")
            loaded += 1

        db.commit()
        print(f"\nDone. {loaded} referral(s) seeded into local DB.")
        print("Open http://localhost:8000/docs to explore the API.")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
