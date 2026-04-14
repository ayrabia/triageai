"""
TriageAI — User Provisioning Script
=====================================
Creates a Cognito account and matching DB row together.

Usage:
    python scripts/provision_user.py <email> <name> <role>

    role: admin | coordinator | reviewer

Example:
    python scripts/provision_user.py ayman.rabia@sjsu.edu "Ayman Rabia" coordinator

The script will:
  1. Create the user in Cognito and set a permanent password
  2. Create (or update) the User row in the DB linked to that Cognito sub
  3. Print the login credentials

HIPAA NOTICE: Only run against dev DB with de-identified data. For production
user creation, use the admin UI (to be built) which enforces clinic_id scoping.
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

import os
import boto3
from db.enums import UserRole
from db.models import Clinic, User
from db.session import SessionLocal

COGNITO_REGION = os.environ["COGNITO_REGION"]
COGNITO_USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]

# SacENT clinic ID — matches the ID created by seed.py
SACENT_CLINIC_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

# Dev-only password — printed to terminal, not stored anywhere
DEV_PASSWORD = "TriageAI-Dev-2026!"


def provision(email: str, name: str, role: str) -> None:
    cognito = boto3.client("cognito-idp", region_name=COGNITO_REGION)

    # --- 1. Create Cognito user ---
    print(f"\nCreating Cognito user: {email} ...")
    try:
        response = cognito.admin_create_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "name", "Value": name},
            ],
            MessageAction="SUPPRESS",  # we set the password manually below
        )
        cognito_sub = next(
            attr["Value"]
            for attr in response["User"]["Attributes"]
            if attr["Name"] == "sub"
        )
        print(f"Cognito user created. Sub: {cognito_sub}")
    except cognito.exceptions.UsernameExistsException:
        # User already exists — fetch their sub
        print("Cognito user already exists, fetching sub ...")
        resp = cognito.admin_get_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=email,
        )
        cognito_sub = next(
            attr["Value"]
            for attr in resp["UserAttributes"]
            if attr["Name"] == "sub"
        )
        print(f"Existing sub: {cognito_sub}")

    # --- 2. Set permanent password ---
    cognito.admin_set_user_password(
        UserPoolId=COGNITO_USER_POOL_ID,
        Username=email,
        Password=DEV_PASSWORD,
        Permanent=True,
    )
    print("Password set.")

    # --- 3. Create or update DB row ---
    db = SessionLocal()
    try:
        # Ensure SacENT clinic exists (seed.py must have run first)
        clinic = db.get(Clinic, SACENT_CLINIC_ID)
        if not clinic:
            print(
                "\nERROR: SacENT clinic not found in DB. Run seed.py first:\n"
                "  python scripts/seed.py"
            )
            return

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            existing.auth_provider_id = cognito_sub
            existing.name = name
            existing.role = UserRole(role)
            print(f"Updated existing DB user: {email}")
        else:
            user = User(
                clinic_id=SACENT_CLINIC_ID,
                auth_provider_id=cognito_sub,
                role=UserRole(role),
                name=name,
                email=email,
            )
            db.add(user)
            print(f"Created DB user: {email}")

        db.commit()
    finally:
        db.close()

    print(f"""
╔══════════════════════════════════════════╗
  User provisioned successfully
  Email:    {email}
  Password: {DEV_PASSWORD}
  Role:     {role}
  Sub:      {cognito_sub}
╚══════════════════════════════════════════╝
""")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python scripts/provision_user.py <email> <name> <role>")
        print("  role: admin | coordinator | reviewer")
        sys.exit(1)

    provision(
        email=sys.argv[1],
        name=sys.argv[2],
        role=sys.argv[3],
    )
