"""
TriageAI FastAPI application entry point.
"""

import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.routes.health import router as health_router
from app.routes.referrals import router as referrals_router
from app.routes.users import router as users_router

app = FastAPI(
    title="TriageAI",
    description="AI-powered referral triage for specialty clinics.",
    version="0.1.0",
    redirect_slashes=False,   # prevent 307s that cross origins and drop Auth header
)

_ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

app.include_router(health_router)
app.include_router(referrals_router, prefix="/referrals")
app.include_router(users_router, prefix="/users")
