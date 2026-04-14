"""
Unit tests for the TriageAI urgency classifier.

Uses synthetic ENT referral text. Tests verify that classification tier,
provider label extraction, and criteria matching are correct.
"""

import pytest

from classifier.classifier import classify_referral, ClassificationResult, VALID_CLASSIFICATIONS


# ---------------------------------------------------------------------------
# Synthetic referral fixtures
# ---------------------------------------------------------------------------

PRIORITY_NECK_MASS = """
REFERRAL — ENT
Priority: Routine

Patient: Male, 58 years old
Referring physician: Dr. Sarah Mendez, Family Medicine, (416) 555-0192

Chief complaint: Rapidly growing neck mass, left side, progressive over 3 weeks.
Mass is firm on palpation, approximately 3.5 cm. Non-tender. No overlying skin changes.
Patient reports 10 lb unintentional weight loss over the past month and night sweats.

No prior CT or ultrasound obtained. No biopsy. No labs sent.

Please evaluate. Concerned for malignancy.
"""

PRIORITY_NASAL_FRACTURE = """
REFERRAL — ENT
Priority: Routine

Patient: Female, 24 years old
Referring physician: Dr. James Okafor, ER Physician, St. Michael's Hospital, (416) 555-0341

Presenting complaint: Nasal fracture following blunt trauma (sport injury) 8 days ago.
Significant deviation of nasal dorsum to the right. Mild epistaxis resolved. Edema improving.
Patient has cosmetic and functional concerns. Desires reduction.

CT face completed 2 days post-injury showing comminuted nasal bone fracture with septal deviation.

TIME SENSITIVE — optimal reduction window is approximately 2 weeks from injury.
Patient is aware of urgency.
"""

# Provider says URGENT — AI finds no matching ENT criteria → SECONDARY APPROVAL
SECONDARY_APPROVAL_CHRONIC_TONSILLITIS = """
REFERRAL — ENT
Priority: 1 - URGENT

Patient: Female, 34 years old
Referring physician: Dr. Maria Patel, Family Medicine, (416) 555-0210

Reason for referral: Recurrent tonsillitis, 4 episodes over the past 12 months, each
treated successfully with antibiotics. No acute infection currently present. Patient is
comfortable between episodes. No airway concerns, no peritonsillar abscess, no drooling
or difficulty swallowing. No weight loss. No masses noted on exam.

Requesting ENT evaluation for possible tonsillectomy.

Labs: WBC within normal limits during last episode.
"""

STANDARD_QUEUE_HEARING_LOSS = """
REFERRAL — ENT
Priority: Routine

Patient: Male, 7 years old
Referring physician: Dr. Priya Nair, Pediatrics, (416) 555-0877

Reason for referral: Bilateral mild sensorineural hearing loss detected on school
screening audiogram. Child is otherwise healthy, developmentally normal. Parents report
no change in hearing over past year. No ear pain, discharge, or vertigo. No feeding or
speech concerns. No sudden onset.

Audiogram results attached. No imaging performed. Stable findings.

Routine evaluation and hearing aid assessment requested.
"""

STANDARD_QUEUE_SINUSITIS = """
REFERRAL — ENT
Priority: Elective

Patient: Female, 42 years old
Referring physician: Dr. Alan Torres, Family Medicine, (416) 555-0654

Reason for referral: Chronic recurrent sinusitis, right-sided, for approximately 18 months.
Patient has had 4 courses of antibiotics in the past year with partial relief. CT sinuses
from 3 months ago shows mild right maxillary sinus mucosal thickening. No polyps identified.
No orbital or intracranial involvement. Patient is medically stable.

Imaging attached. Labs not indicated. Requesting surgical consultation.
"""

INCOMPLETE_AUTH_ONLY = """
REFERRAL — ENT

Authorization only. No clinical notes attached.

Patient has been referred for ENT evaluation. Authorization number: AUTH-2024-00943.
Insurance: Blue Cross Blue Shield.

No referring physician name or contact. No diagnosis listed. No imaging. No labs.
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestPriorityReview:
    def test_neck_mass_classified_priority_review(self):
        result = classify_referral(PRIORITY_NECK_MASS, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "PRIORITY REVIEW", (
            f"Expected PRIORITY REVIEW for neck mass, got {result.classification}. Reason: {result.reason}"
        )
        assert result.confidence > 0.5
        assert len(result.matched_criteria) > 0, "Expected at least one matched criterion"
        assert any("CT" in item or "imaging" in item.lower() for item in result.missing_info), (
            f"Expected missing imaging flagged, got: {result.missing_info}"
        )

    def test_nasal_fracture_classified_priority_review(self):
        result = classify_referral(PRIORITY_NASAL_FRACTURE, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "PRIORITY REVIEW", (
            f"Expected PRIORITY REVIEW for acute nasal fracture, got {result.classification}. Reason: {result.reason}"
        )
        assert result.confidence > 0.5
        assert result.recommended_window is not None, (
            "Expected a recommended scheduling window for PRIORITY REVIEW"
        )
        keywords_lower = [k.lower() for k in result.extracted_keywords]
        assert any("nasal" in k or "fracture" in k for k in keywords_lower), (
            f"Expected nasal fracture in keywords, got: {result.extracted_keywords}"
        )

    def test_priority_review_upgrades_routine_provider_label(self):
        """AI should upgrade to PRIORITY REVIEW even when provider marked routine."""
        result = classify_referral(PRIORITY_NECK_MASS, specialty="ENT")
        assert result.classification == "PRIORITY REVIEW"
        # Provider said routine — AI upgraded based on clinical criteria
        assert result.provider_urgency_label in {"routine", "none found"}, (
            f"Expected provider label to be routine or absent, got: {result.provider_urgency_label}"
        )


class TestSecondaryApproval:
    def test_provider_urgent_no_criteria_classified_secondary_approval(self):
        result = classify_referral(SECONDARY_APPROVAL_CHRONIC_TONSILLITIS, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "SECONDARY APPROVAL", (
            f"Expected SECONDARY APPROVAL for urgent-labeled but routine clinical content, "
            f"got {result.classification}. Reason: {result.reason}"
        )

    def test_secondary_approval_surfaces_both_labels(self):
        """SECONDARY APPROVAL must expose the provider's label and TriageAI's finding."""
        result = classify_referral(SECONDARY_APPROVAL_CHRONIC_TONSILLITIS, specialty="ENT")
        assert result.classification == "SECONDARY APPROVAL"
        # Provider label must be captured
        assert result.provider_urgency_label in {"urgent", "stat"}, (
            f"Expected provider_urgency_label to reflect the URGENT marking, "
            f"got: {result.provider_urgency_label}"
        )
        # Referring clinic's raw label must be preserved
        assert result.referring_clinic_classification is not None, (
            "Expected referring_clinic_classification to be set for SECONDARY APPROVAL"
        )
        # No clinical criteria should have matched
        assert result.matched_criteria == [], (
            f"Expected no matched criteria for SECONDARY APPROVAL, got: {result.matched_criteria}"
        )

    def test_secondary_approval_has_no_recommended_window(self):
        result = classify_referral(SECONDARY_APPROVAL_CHRONIC_TONSILLITIS, specialty="ENT")
        assert result.classification == "SECONDARY APPROVAL"
        assert result.recommended_window is None, (
            "SECONDARY APPROVAL should not have a recommended scheduling window"
        )


class TestStandardQueue:
    def test_stable_hearing_loss_classified_standard_queue(self):
        result = classify_referral(STANDARD_QUEUE_HEARING_LOSS, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "STANDARD QUEUE", (
            f"Expected STANDARD QUEUE for stable hearing loss, got {result.classification}. Reason: {result.reason}"
        )
        assert result.confidence > 0.5

    def test_chronic_sinusitis_classified_standard_queue(self):
        result = classify_referral(STANDARD_QUEUE_SINUSITIS, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "STANDARD QUEUE", (
            f"Expected STANDARD QUEUE for chronic sinusitis, got {result.classification}. Reason: {result.reason}"
        )


class TestIncomplete:
    def test_auth_only_classified_incomplete(self):
        result = classify_referral(INCOMPLETE_AUTH_ONLY, specialty="ENT")
        assert isinstance(result, ClassificationResult)
        assert result.classification == "INCOMPLETE", (
            f"Expected INCOMPLETE for auth-only referral, got {result.classification}. Reason: {result.reason}"
        )
        assert len(result.missing_info) > 0, "Expected missing_info to be non-empty"

    def test_empty_referral_returns_incomplete(self):
        result = classify_referral("", specialty="ENT")
        assert result.classification == "INCOMPLETE"
        assert result.error is not None


class TestResultSchema:
    def test_result_has_all_required_fields(self):
        result = classify_referral(STANDARD_QUEUE_HEARING_LOSS, specialty="ENT")
        d = result.to_dict()
        required = [
            "classification",
            "reason",
            "provider_urgency_label",
            "referring_clinic_classification",
            "matched_criteria",
            "recommended_window",
            "extracted_keywords",
            "confidence",
            "missing_info",
        ]
        for key in required:
            assert key in d, f"Missing key in result: {key}"

    def test_classification_is_valid_tier(self):
        result = classify_referral(PRIORITY_NECK_MASS, specialty="ENT")
        assert result.classification in VALID_CLASSIFICATIONS, (
            f"Got unexpected classification value: {result.classification}"
        )

    def test_priority_review_has_recommended_window(self):
        result = classify_referral(PRIORITY_NASAL_FRACTURE, specialty="ENT")
        if result.classification == "PRIORITY REVIEW":
            assert result.recommended_window is not None, (
                "PRIORITY REVIEW results should include a recommended scheduling window"
            )
