"""
Unit tests for the TriageAI urgency classifier.

Uses synthetic ENT referral text. Tests are structured to verify that
classification direction is correct — exact output may vary by model.
"""

import pytest

from classifier.classifier import classify_referral, ClassificationResult


# ---------------------------------------------------------------------------
# Synthetic referral fixtures
# ---------------------------------------------------------------------------

URGENT_NECK_MASS = """
REFERRAL — ENT

Patient: Male, 58 years old
Referring physician: Dr. Sarah Mendez, Family Medicine, (416) 555-0192

Chief complaint: Rapidly growing neck mass, left side, progressive over 3 weeks.
Mass is firm on palpation, approximately 3.5 cm. Non-tender. No overlying skin changes.
Patient reports 10 lb unintentional weight loss over the past month and night sweats.

No prior CT or ultrasound obtained. No biopsy. No labs sent.

Please evaluate urgently. Concerned for malignancy.
"""

URGENT_NASAL_FRACTURE = """
REFERRAL — ENT

Patient: Female, 24 years old
Referring physician: Dr. James Okafor, ER Physician, St. Michael's Hospital, (416) 555-0341

Presenting complaint: Nasal fracture following blunt trauma (sport injury) 8 days ago.
Significant deviation of nasal dorsum to the right. Mild epistaxis resolved. Edema improving.
Patient has cosmetic and functional concerns. Desires reduction.

CT face completed 2 days post-injury showing comminuted nasal bone fracture with septal deviation.

TIME SENSITIVE — optimal reduction window is approximately 2 weeks from injury.
Patient is aware of urgency.
"""

ROUTINE_HEARING_LOSS = """
REFERRAL — ENT

Patient: Male, 7 years old
Referring physician: Dr. Priya Nair, Pediatrics, (416) 555-0877

Reason for referral: Bilateral mild sensorineural hearing loss detected on school screening audiogram.
Child is otherwise healthy, developmentally normal. Parents report no change in hearing over past year.
No ear pain, discharge, or vertigo. No feeding or speech concerns.

Audiogram results attached. No imaging performed. Stable findings.

Routine evaluation and hearing aid assessment requested.
"""

ROUTINE_SINUSITIS = """
REFERRAL — ENT

Patient: Female, 42 years old
Referring physician: Dr. Alan Torres, Family Medicine, (416) 555-0654

Reason for referral: Chronic recurrent sinusitis, right-sided, for approximately 18 months.
Patient has had 4 courses of antibiotics in the past year with partial relief. CT sinuses
from 3 months ago shows mild right maxillary sinus mucosal thickening. No polyps identified.
No orbital or intracranial involvement. Patient is medically stable.

Imaging attached. Labs not indicated. Requesting surgical consultation.
"""

NEEDS_REVIEW_MISSING_INFO = """
REFERRAL — ENT

Authorization only. No clinical notes attached.

Patient has been referred for ENT evaluation. Authorization number: AUTH-2024-00943.
Insurance: Blue Cross Blue Shield.

No referring physician name or contact. No diagnosis listed. No imaging. No labs.
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestUrgentReferrals:
    def test_neck_mass_classified_urgent(self):
        result = classify_referral(URGENT_NECK_MASS, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "URGENT", (
            f"Expected URGENT for neck mass, got {result.classification}. Reason: {result.reason}"
        )
        assert result.confidence > 0.5
        # Should flag missing imaging
        assert any("CT" in item or "imaging" in item.lower() for item in result.missing_info), (
            f"Expected missing imaging flagged, got: {result.missing_info}"
        )

    def test_nasal_fracture_classified_urgent(self):
        result = classify_referral(URGENT_NASAL_FRACTURE, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "URGENT", (
            f"Expected URGENT for nasal fracture, got {result.classification}. Reason: {result.reason}"
        )
        assert result.confidence > 0.5
        keywords_lower = [k.lower() for k in result.extracted_keywords]
        assert any("nasal" in k or "fracture" in k for k in keywords_lower), (
            f"Expected nasal fracture in keywords, got: {result.extracted_keywords}"
        )


class TestRoutineReferrals:
    def test_pediatric_hearing_loss_classified_routine(self):
        result = classify_referral(ROUTINE_HEARING_LOSS, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "ROUTINE", (
            f"Expected ROUTINE for stable hearing loss, got {result.classification}. Reason: {result.reason}"
        )
        assert result.confidence > 0.5

    def test_chronic_sinusitis_classified_routine(self):
        result = classify_referral(ROUTINE_SINUSITIS, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "ROUTINE", (
            f"Expected ROUTINE for chronic sinusitis, got {result.classification}. Reason: {result.reason}"
        )


class TestNeedsReviewReferrals:
    def test_missing_info_classified_needs_review(self):
        result = classify_referral(NEEDS_REVIEW_MISSING_INFO, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "NEEDS_REVIEW", (
            f"Expected NEEDS_REVIEW for auth-only referral, got {result.classification}. Reason: {result.reason}"
        )
        assert len(result.missing_info) > 0, "Expected missing_info to be non-empty"


class TestEdgeCases:
    def test_empty_referral_returns_needs_review(self):
        result = classify_referral("", specialty="ENT")
        assert result.classification == "NEEDS_REVIEW"
        assert result.error is not None

    def test_result_has_all_required_fields(self):
        result = classify_referral(ROUTINE_HEARING_LOSS, specialty="ENT")
        d = result.to_dict()
        for key in ["classification", "reason", "extracted_keywords", "confidence", "missing_info"]:
            assert key in d, f"Missing key: {key}"

    def test_classification_is_valid_value(self):
        result = classify_referral(URGENT_NECK_MASS, specialty="ENT")
        assert result.classification in {"URGENT", "ROUTINE", "NEEDS_REVIEW"}
