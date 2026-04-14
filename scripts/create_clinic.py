"""
TriageAI — Clinic Creation Script
===================================
Creates a new clinic and optionally reassigns an existing user to it.

Usage:
    python scripts/create_clinic.py <clinic_name> <specialty> [user_email]

Example:
    python scripts/create_clinic.py "Prime ENT" ENT ayman.rabia@sjsu.edu
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

from db.models import Clinic, User
from db.session import SessionLocal


def create_clinic(name: str, specialty: str, user_email: str = None) -> None:
    db = SessionLocal()
    try:
        # --- 1. Create clinic ---
        existing_clinic = db.query(Clinic).filter(Clinic.name == name).first()
        if existing_clinic:
            print(f"Clinic '{name}' already exists (id: {existing_clinic.id})")
            clinic = existing_clinic
        else:
            clinic = Clinic(
                id=uuid.uuid4(),
                name=name,
                specialty=specialty,
            )
            db.add(clinic)
            db.flush()
            print(f"Created clinic: {name} (id: {clinic.id})")

        # --- 2. Reassign user if provided ---
        if user_email:
            user = db.query(User).filter(User.email == user_email).first()
            if not user:
                print(f"ERROR: User {user_email} not found. Run provision_user.py first.")
                return
            old_clinic = db.get(Clinic, user.clinic_id)
            user.clinic_id = clinic.id
            print(f"Moved {user_email} from '{old_clinic.name if old_clinic else user.clinic_id}' → '{name}'")

        db.commit()
        print(f"\nDone. Clinic ID: {clinic.id}")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/create_clinic.py <clinic_name> <specialty> [user_email]")
        sys.exit(1)

    create_clinic(
        name=sys.argv[1],
        specialty=sys.argv[2],
        user_email=sys.argv[3] if len(sys.argv) > 3 else None,
    )
