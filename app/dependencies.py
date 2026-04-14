"""
FastAPI dependencies shared across routes.

Auth (get_current_user):
  Verifies the Bearer token from the Authorization header against AWS Cognito,
  then looks up the user by their Cognito subject ID (sub claim).
  Returns a User with a verified clinic_id — all route-level clinic_id checks
  must derive from this value, never from request parameters.

DB (get_db):
  Re-exported here so routes only need to import from app.dependencies.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth import verify_token
from db.models import User
from db.session import get_db  # noqa: F401 — re-exported for routes

_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Verify the Bearer JWT from the Authorization header and return the
    corresponding User row (which carries a verified clinic_id).

    Raises 401 if the token is missing, invalid, or expired.
    Raises 403 if the token is valid but the user has not been provisioned
    in TriageAI (e.g. Cognito account exists but no User row yet).
    """
    claims = verify_token(credentials.credentials)
    cognito_sub = claims.get("sub")

    user = db.query(User).filter(User.auth_provider_id == cognito_sub).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User not provisioned — contact your clinic administrator",
        )

    return user
