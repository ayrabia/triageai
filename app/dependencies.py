"""
FastAPI dependencies shared across routes.

Auth (get_current_user):
  Currently a placeholder — returns None for all requests.
  Replace the body with real JWT verification (Auth0 / AWS Cognito) before
  any PHI touches this service in production. The routes already accept the
  dependency so the swap is a one-file change.

DB (get_db):
  Re-exported here so routes only need to import from app.dependencies.
"""

from typing import Optional
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from db.session import get_db  # noqa: F401 — re-exported for routes
from db.models import User


def get_current_user(
    x_user_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    TODO: Replace with real JWT verification before production.

    For local development only — accepts an X-User-Id header and looks up
    the user in the DB. This is NOT secure and must not be used with real PHI.
    """
    if x_user_id is None:
        return None
    try:
        uid = UUID(x_user_id)
        return db.get(User, uid)
    except (ValueError, Exception):
        return None
