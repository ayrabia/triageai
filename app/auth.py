"""
Cognito JWT verification for TriageAI.

Verifies Bearer tokens issued by an AWS Cognito User Pool.
Cognito's public keys (JWKS) are fetched once on first use and cached
for the lifetime of the process — no network call on every request.

Required env vars:
  COGNITO_REGION        — e.g. us-east-1
  COGNITO_USER_POOL_ID  — e.g. us-east-1_AbCdEfGhI
  COGNITO_APP_CLIENT_ID — the App Client ID from your User Pool
"""

import os
from functools import lru_cache

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt

COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-1")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")

_ISSUER = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
)
_JWKS_URL = f"{_ISSUER}/.well-known/jwks.json"


@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    """
    Fetch Cognito's public keys and cache them for the process lifetime.
    Keys are stable — Cognito rotates them rarely. Cache is invalidated on
    app restart, which is sufficient for this scale.
    """
    resp = httpx.get(_JWKS_URL, timeout=10)
    resp.raise_for_status()
    return resp.json()


def verify_token(token: str) -> dict:
    """
    Verify a Cognito JWT and return its decoded claims.

    Checks:
      - Signature (RS256 against Cognito's public keys)
      - Expiry
      - Audience (must match COGNITO_APP_CLIENT_ID)
      - Issuer (must match this User Pool)

    Raises HTTPException 401 on any failure.
    Returns the claims dict (includes 'sub', 'email', 'cognito:groups', etc.).
    """
    if not COGNITO_USER_POOL_ID or not COGNITO_APP_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth not configured — set COGNITO_USER_POOL_ID and COGNITO_APP_CLIENT_ID",
        )

    try:
        jwks = _get_jwks()
        claims = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=COGNITO_APP_CLIENT_ID,
            issuer=_ISSUER,
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return claims
