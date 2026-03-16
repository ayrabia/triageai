"""
Core urgency classifier for TriageAI.

Accepts raw referral text and returns a structured classification result.
Uses Claude API (primary) with OpenAI as fallback.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv

from classifier.prompts import get_prompt

load_dotenv()

CLAUDE_MODEL = "claude-sonnet-4-6"
OPENAI_MODEL = "gpt-4o"


@dataclass
class ClassificationResult:
    classification: str  # "URGENT" | "ROUTINE" | "NEEDS_REVIEW"
    reason: str
    extracted_keywords: list[str]
    confidence: float
    missing_info: list[str]
    model_used: str = ""
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "classification": self.classification,
            "reason": self.reason,
            "extracted_keywords": self.extracted_keywords,
            "confidence": self.confidence,
            "missing_info": self.missing_info,
            "model_used": self.model_used,
            "error": self.error,
        }


def _parse_model_response(raw_text: str) -> dict:
    """Extract and parse JSON from model response text."""
    text = raw_text.strip()
    # Strip markdown code fences if present
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


def _classify_with_openai(system_prompt: str, user_message: str) -> tuple[dict, str]:
    """Call the OpenAI API and return parsed result + model name."""
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        max_tokens=1024,
    )
    raw = response.choices[0].message.content
    return _parse_model_response(raw), OPENAI_MODEL


def classify_referral(
    referral_text: str,
    specialty: str = "ENT",
) -> ClassificationResult:
    """
    Classify an incoming referral by urgency.

    Args:
        referral_text: Raw text from the faxed referral document.
        specialty: Clinic specialty. Defaults to "ENT".

    Returns:
        ClassificationResult with classification, reason, keywords, confidence,
        missing_info, and the model used.
    """
    if not referral_text or not referral_text.strip():
        return ClassificationResult(
            classification="NEEDS_REVIEW",
            reason="Referral text is empty or blank.",
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

    # Try Claude first
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            result_dict, model_used = _classify_with_claude(system_prompt, user_message)
        except Exception as e:
            last_error = f"Claude error: {e}"
            print(f"[TriageAI] Claude failed: {e}")  # visible in terminal
    else:
        print("[TriageAI] ANTHROPIC_API_KEY not found in environment")

    # Fallback to OpenAI
    if not result_dict and os.environ.get("OPENAI_API_KEY"):
        try:
            result_dict, model_used = _classify_with_openai(system_prompt, user_message)
            last_error = ""
        except Exception as e:
            last_error = f"OpenAI error: {e}"

    if not result_dict:
        return ClassificationResult(
            classification="NEEDS_REVIEW",
            reason="Classification unavailable — API error. Please review manually.",
            extracted_keywords=[],
            confidence=0.0,
            missing_info=[],
            error=last_error or "No API key configured.",
        )

    return ClassificationResult(
        classification=result_dict.get("classification", "NEEDS_REVIEW"),
        reason=result_dict.get("reason", ""),
        extracted_keywords=result_dict.get("extracted_keywords", []),
        confidence=float(result_dict.get("confidence", 0.0)),
        missing_info=result_dict.get("missing_info", []),
        model_used=model_used,
        error=None,
    )
