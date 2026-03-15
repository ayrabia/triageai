"""
Missing information detection for referral documents.

Each specialty has a checklist of required fields. This module checks extracted
referral text against the checklist and returns missing fields along with a
suggested callback prompt for staff to use when contacting the referring clinic.
"""

from dataclasses import dataclass, field
import re


@dataclass
class MissingInfoResult:
    missing_fields: list[str]
    callback_prompt: str
    is_complete: bool


# ---------------------------------------------------------------------------
# Required fields per specialty
# ---------------------------------------------------------------------------

REQUIRED_FIELDS: dict[str, list[dict]] = {
    "ENT": [
        {
            "name": "Clinical notes",
            "patterns": [
                r"chief complaint",
                r"presenting complaint",
                r"reason for referral",
                r"history of present illness",
                r"clinical note",
                r"assessment",
                r"plan",
                r"hpi",
            ],
            "message": "No clinical notes — only an authorization or cover sheet was received.",
        },
        {
            "name": "Referring physician contact",
            "patterns": [
                r"\(\d{3}\)\s*\d{3}[-.\s]?\d{4}",  # phone (416) 555-1234
                r"\d{3}[-.\s]\d{3}[-.\s]\d{4}",      # phone 416-555-1234
                r"dr\.?\s+\w+",                        # Dr. LastName
                r"referring physician",
                r"fax[:\s]+\d",
            ],
            "message": "No referring physician name or contact information found.",
        },
        {
            "name": "Imaging (CT/MRI)",
            "patterns": [
                r"\bct\b",
                r"\bmri\b",
                r"imaging",
                r"radiology",
                r"ultrasound",
                r"x-ray",
                r"scan",
            ],
            "message": "No imaging results mentioned. CT or MRI may be required given the described symptoms.",
            "conditional": True,  # Only required when mass/lesion language is present
            "conditional_patterns": [
                r"mass",
                r"lesion",
                r"lump",
                r"growth",
                r"tumor",
                r"tumour",
                r"swelling",
                r"neck",
                r"fracture",
            ],
        },
        {
            "name": "Lab results",
            "patterns": [
                r"\blab\b",
                r"blood work",
                r"cbc",
                r"chemistry",
                r"culture",
                r"biopsy",
                r"pathology",
                r"result",
            ],
            "message": "No lab results attached. Labs may be required given the described symptoms.",
            "conditional": True,
            "conditional_patterns": [
                r"infect",
                r"cancer",
                r"malign",
                r"carcinoma",
                r"lymphoma",
                r"fever",
                r"abscess",
                r"sepsis",
            ],
        },
    ],
    "Cardiology": [
        {
            "name": "Clinical notes",
            "patterns": [
                r"chief complaint",
                r"reason for referral",
                r"clinical note",
                r"history",
                r"assessment",
            ],
            "message": "No clinical notes attached.",
        },
        {
            "name": "Referring physician contact",
            "patterns": [
                r"\(\d{3}\)\s*\d{3}[-.\s]?\d{4}",
                r"\d{3}[-.\s]\d{3}[-.\s]\d{4}",
                r"dr\.?\s+\w+",
            ],
            "message": "No referring physician contact information found.",
        },
        {
            "name": "ECG / Echo results",
            "patterns": [
                r"ecg",
                r"ekg",
                r"echo",
                r"echocardiogram",
                r"holter",
                r"stress test",
            ],
            "message": "No cardiac test results (ECG, Echo) attached.",
            "conditional": True,
            "conditional_patterns": [
                r"chest pain",
                r"palpitation",
                r"arrhythmia",
                r"murmur",
                r"syncope",
                r"shortness of breath",
            ],
        },
    ],
}

# Add generic fallback for unlisted specialties
_GENERIC_REQUIRED = [
    {
        "name": "Clinical notes",
        "patterns": [r"chief complaint", r"reason for referral", r"history", r"assessment"],
        "message": "No clinical notes attached.",
    },
    {
        "name": "Referring physician contact",
        "patterns": [
            r"\(\d{3}\)\s*\d{3}[-.\s]?\d{4}",
            r"\d{3}[-.\s]\d{3}[-.\s]\d{4}",
            r"dr\.?\s+\w+",
        ],
        "message": "No referring physician contact information found.",
    },
]

for _specialty in ("Orthopedics", "Neurology", "GI"):
    REQUIRED_FIELDS[_specialty] = _GENERIC_REQUIRED


# ---------------------------------------------------------------------------
# Detection logic
# ---------------------------------------------------------------------------

def _text_matches_any(text: str, patterns: list[str]) -> bool:
    text_lower = text.lower()
    return any(re.search(p, text_lower) for p in patterns)


def check_missing_info(referral_text: str, specialty: str = "ENT") -> MissingInfoResult:
    """
    Check referral text against the specialty's required fields checklist.

    Args:
        referral_text: Raw referral text.
        specialty: Clinic specialty. Defaults to "ENT".

    Returns:
        MissingInfoResult with missing_fields, callback_prompt, and is_complete flag.
    """
    required = REQUIRED_FIELDS.get(specialty, _GENERIC_REQUIRED)
    missing: list[str] = []
    missing_messages: list[str] = []

    for field_def in required:
        is_conditional = field_def.get("conditional", False)

        if is_conditional:
            # Only flag this field if the referral mentions the trigger condition
            conditional_patterns = field_def.get("conditional_patterns", [])
            if not _text_matches_any(referral_text, conditional_patterns):
                continue  # Not applicable for this referral

        found = _text_matches_any(referral_text, field_def["patterns"])
        if not found:
            missing.append(field_def["name"])
            missing_messages.append(f"- {field_def['message']}")

    is_complete = len(missing) == 0
    callback_prompt = _build_callback_prompt(missing_messages, specialty) if missing else ""

    return MissingInfoResult(
        missing_fields=missing,
        callback_prompt=callback_prompt,
        is_complete=is_complete,
    )


def _build_callback_prompt(missing_messages: list[str], specialty: str) -> str:
    issues = "\n".join(missing_messages)
    return (
        f"Hello, I'm calling from {specialty} regarding a referral we received. "
        f"We're missing some information needed to process this referral:\n\n"
        f"{issues}\n\n"
        f"Could you please send the above information by fax or email at your earliest convenience? "
        f"Thank you."
    )
