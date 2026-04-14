"""
Core urgency classifier for TriageAI.

Accepts raw referral text and returns a structured classification result.
Uses Claude via AWS Bedrock exclusively — the only path covered by the AWS BAA.
OpenAI fallback has been intentionally removed: it is not BAA-covered and
must not receive real PHI.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv

from classifier.prompts import get_prompt

load_dotenv()

CLAUDE_MODEL = "claude-sonnet-4-6"

# Valid classification tiers
VALID_CLASSIFICATIONS = {"PRIORITY REVIEW", "SECONDARY APPROVAL", "STANDARD QUEUE", "INCOMPLETE"}


@dataclass
class ClassificationResult:
    classification: str        # "PRIORITY REVIEW" | "SECONDARY APPROVAL" | "STANDARD QUEUE" | "INCOMPLETE"
    reason: str
    provider_urgency_label: str  # what the referring provider marked (e.g. "urgent", "routine", "none found")
    referring_clinic_classification: Optional[str]  # exact label as written in referral, or None
    matched_criteria: list[str]
    recommended_window: Optional[str]  # scheduling window for PRIORITY REVIEW, else None
    extracted_keywords: list[str]
    confidence: float
    missing_info: list[str]
    model_used: str = ""
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "classification": self.classification,
            "reason": self.reason,
            "provider_urgency_label": self.provider_urgency_label,
            "referring_clinic_classification": self.referring_clinic_classification,
            "matched_criteria": self.matched_criteria,
            "recommended_window": self.recommended_window,
            "extracted_keywords": self.extracted_keywords,
            "confidence": self.confidence,
            "missing_info": self.missing_info,
            "model_used": self.model_used,
            "error": self.error,
        }


def _parse_model_response(raw_text: str) -> dict:
    """Extract and parse JSON from model response text."""
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(
            line for line in lines if not line.startswith("```")
        ).strip()
    return json.loads(text)


def _classify_with_claude(system_prompt: str, user_message: str) -> tuple[dict, str]:
    """Call the Claude API and return parsed result + model name."""
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    raw = message.content[0].text
    return _parse_model_response(raw), CLAUDE_MODEL


def classify_referral(
    referral_text: str,
    specialty: str = "ENT",
) -> ClassificationResult:
    """
    Classify an incoming referral.

    Args:
        referral_text: Raw text from the faxed referral document.
        specialty: Clinic specialty. Defaults to "ENT".

    Returns:
        ClassificationResult with classification tier, provider label,
        TriageAI's matched criteria, scheduling window, and supporting fields.
    """
    if not referral_text or not referral_text.strip():
        return ClassificationResult(
            classification="INCOMPLETE",
            reason="Referral text is empty or blank.",
            provider_urgency_label="none found",
            referring_clinic_classification=None,
            matched_criteria=[],
            recommended_window=None,
            extracted_keywords=[],
            confidence=1.0,
            missing_info=["referral text"],
            error="Empty input",
        )

    prompts = get_prompt(specialty, referral_text)
    system_prompt = prompts["system"]
    user_message = prompts["user"]

    result_dict: dict = {}
    model_used: str = ""
    last_error: str = ""

    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            result_dict, model_used = _classify_with_claude(system_prompt, user_message)
        except Exception as e:
            last_error = f"Claude error: {e}"
    else:
        last_error = "ANTHROPIC_API_KEY not set"

    if not result_dict:
        return ClassificationResult(
            classification="INCOMPLETE",
            reason="Classification unavailable — API error. Please review manually.",
            provider_urgency_label="none found",
            referring_clinic_classification=None,
            matched_criteria=[],
            recommended_window=None,
            extracted_keywords=[],
            confidence=0.0,
            missing_info=[],
            error=last_error or "No API key configured.",
        )

    # Normalise classification to a valid tier; fall back to INCOMPLETE if unexpected
    raw_classification = result_dict.get("classification", "INCOMPLETE")
    classification = raw_classification if raw_classification in VALID_CLASSIFICATIONS else "INCOMPLETE"

    return ClassificationResult(
        classification=classification,
        reason=result_dict.get("reason", ""),
        provider_urgency_label=result_dict.get("provider_urgency_label", "none found"),
        referring_clinic_classification=result_dict.get("referring_clinic_classification"),
        matched_criteria=result_dict.get("matched_criteria", []),
        recommended_window=result_dict.get("recommended_window"),
        extracted_keywords=result_dict.get("extracted_keywords", []),
        confidence=float(result_dict.get("confidence", 0.0)),
        missing_info=result_dict.get("missing_info", []),
        model_used=model_used,
        error=None,
    )
