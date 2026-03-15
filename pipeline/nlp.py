"""
AWS Comprehend Medical wrapper for extracting clinical entities from referral text.

Extracts medical conditions, medications, anatomy, procedures, and protected health
information (PHI) from unstructured referral notes.
"""

import os
from dataclasses import dataclass, field
from typing import Optional

import boto3


@dataclass
class ClinicalEntity:
    text: str
    category: str       # MEDICAL_CONDITION, MEDICATION, ANATOMY, TEST_TREATMENT_PROCEDURE, etc.
    type: str
    score: float
    traits: list[str] = field(default_factory=list)


@dataclass
class NLPResult:
    entities: list[ClinicalEntity]
    phi_detected: bool
    raw_entities: list[dict] = field(default_factory=list)

    def conditions(self) -> list[str]:
        return [e.text for e in self.entities if e.category == "MEDICAL_CONDITION"]

    def medications(self) -> list[str]:
        return [e.text for e in self.entities if e.category == "MEDICATION"]

    def anatomy(self) -> list[str]:
        return [e.text for e in self.entities if e.category == "ANATOMY"]

    def procedures(self) -> list[str]:
        return [e.text for e in self.entities if e.category == "TEST_TREATMENT_PROCEDURE"]


def get_comprehend_client():
    return boto3.client(
        "comprehendmedical",
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )


def extract_clinical_entities(text: str) -> NLPResult:
    """
    Extract medical entities from referral text using AWS Comprehend Medical.

    Args:
        text: Raw referral text.

    Returns:
        NLPResult with structured entities.
    """
    client = get_comprehend_client()

    # Comprehend Medical has a 20,000 byte limit per request
    # Truncate if needed (UTF-8 safe)
    encoded = text.encode("utf-8")
    if len(encoded) > 20000:
        text = encoded[:20000].decode("utf-8", errors="ignore")

    response = client.detect_entities_v2(Text=text)

    entities = []
    for raw in response.get("Entities", []):
        traits = [t["Name"] for t in raw.get("Traits", [])]
        entities.append(
            ClinicalEntity(
                text=raw["Text"],
                category=raw["Category"],
                type=raw["Type"],
                score=raw["Score"],
                traits=traits,
            )
        )

    # Check for PHI
    phi_response = client.detect_phi(Text=text)
    phi_detected = len(phi_response.get("Entities", [])) > 0

    return NLPResult(
        entities=entities,
        phi_detected=phi_detected,
        raw_entities=response.get("Entities", []),
    )


def summarize_for_classifier(nlp_result: NLPResult) -> str:
    """
    Convert NLP extraction into a concise summary to prepend to the
    classifier prompt, enriching it with structured clinical signal.

    Args:
        nlp_result: NLPResult from extract_clinical_entities.

    Returns:
        Human-readable summary string.
    """
    parts = []
    if nlp_result.conditions():
        parts.append("Conditions: " + ", ".join(nlp_result.conditions()))
    if nlp_result.anatomy():
        parts.append("Anatomy: " + ", ".join(nlp_result.anatomy()))
    if nlp_result.medications():
        parts.append("Medications: " + ", ".join(nlp_result.medications()))
    if nlp_result.procedures():
        parts.append("Procedures/Tests: " + ", ".join(nlp_result.procedures()))
    return "\n".join(parts)
