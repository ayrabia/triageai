"""
POST /referrals — classify an incoming referral.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from classifier.classifier import classify_referral
from pipeline.missing_info import check_missing_info

router = APIRouter()


class ReferralRequest(BaseModel):
    text: str = Field(..., description="Raw referral text extracted from fax document.")
    specialty: str = Field(default="ENT", description="Clinic specialty.")


class ReferralResponse(BaseModel):
    classification: str
    reason: str
    extracted_keywords: list[str]
    confidence: float
    missing_info: list[str]
    model_used: str
    callback_prompt: str


@router.post("/", response_model=ReferralResponse)
def classify(request: ReferralRequest):
    """
    Classify an incoming referral as URGENT, ROUTINE, or NEEDS_REVIEW.

    Returns a structured classification with the reason, extracted keywords,
    confidence score, any detected missing information, and a callback prompt
    for staff to use when contacting the referring clinic.
    """
    if not request.text.strip():
        raise HTTPException(status_code=422, detail="Referral text cannot be empty.")

    result = classify_referral(request.text, specialty=request.specialty)
    missing = check_missing_info(request.text, specialty=request.specialty)

    # Merge missing info from both classifier and rule-based detection
    all_missing = list(set(result.missing_info + missing.missing_fields))

    return ReferralResponse(
        classification=result.classification,
        reason=result.reason,
        extracted_keywords=result.extracted_keywords,
        confidence=result.confidence,
        missing_info=all_missing,
        model_used=result.model_used,
        callback_prompt=missing.callback_prompt,
    )
