"""
TriageAI FastAPI application entry point.
"""

import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.include_router(health_router)
app.include_router(referrals_router, prefix="/referrals")
app.include_router(users_router, prefix="/users")
