"""
TriageAI Streamlit Demo

Paste a referral → get urgency classification with colored badge,
extracted keywords, and missing info checklist.
"""

import os
import sys

import streamlit as st
from dotenv import load_dotenv

# Allow running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

from classifier.classifier import classify_referral
from pipeline.missing_info import check_missing_info

# ---------------------------------------------------------------------------
# One-click example referrals
# ---------------------------------------------------------------------------

EXAMPLES = {
    "🔴 Urgent — Neck Mass": """REFERRAL — ENT

Patient: Male, 62 years old
Referring physician: Dr. Sarah Mendez, Family Medicine, (416) 555-0192

Chief complaint: Rapidly growing left neck mass over 4 weeks. Mass is firm, non-tender, approximately 4 cm.
Patient reports unintentional 12 lb weight loss and night sweats over the past 6 weeks.
Smoker x 30 years. No CT or biopsy completed. No labs.

Concerned for malignancy. Please evaluate urgently.""",

    "🟡 Needs Review — Auth Only": """Authorization for ENT referral.
Authorization number: AUTH-2024-00943
Insurance: Blue Cross Blue Shield

No clinical notes. No imaging. No labs. No referring physician name or contact.""",

    "🟢 Routine — Hearing Loss": """REFERRAL — ENT

Patient: Female, 8 years old
Referring physician: Dr. Priya Nair, Pediatrics, (416) 555-0877

Reason for referral: Bilateral mild hearing loss on school audiogram. Child is healthy and
developmentally normal. No change in hearing over past year. No ear pain or discharge.
Audiogram attached. Requesting ENT evaluation and hearing aid assessment.""",
}

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="TriageAI Demo",
    page_icon="🏥",
    layout="wide",
)

st.title("🏥 TriageAI")
st.caption("AI-powered referral triage for specialty clinics — *Pre-Seed Demo*")
st.divider()

# ---------------------------------------------------------------------------
# Sidebar: specialty selector + examples
# ---------------------------------------------------------------------------

with st.sidebar:
    st.header("Settings")
    specialty = st.selectbox(
        "Specialty",
        options=["ENT", "Cardiology", "Orthopedics", "Neurology", "GI"],
        index=0,
    )

    st.divider()
    st.header("One-Click Examples")
    for label, text in EXAMPLES.items():
        if st.button(label, use_container_width=True):
            st.session_state["referral_text"] = text

    st.divider()
    st.caption(
        "⚠️ **Not a clinical decision support tool.**  \n"
        "AI surfaces information — clinicians make all final decisions."
    )

# ---------------------------------------------------------------------------
# Main: text input + classify
# ---------------------------------------------------------------------------

referral_text = st.text_area(
    "Paste referral text",
    value=st.session_state.get("referral_text", ""),
    height=300,
    placeholder="Paste the full referral text here, or click a one-click example in the sidebar...",
    key="referral_input",
)

col1, col2 = st.columns([1, 5])
with col1:
    classify_clicked = st.button("Classify Referral", type="primary", use_container_width=True)
with col2:
    if st.button("Clear", use_container_width=False):
        st.session_state["referral_text"] = ""
        st.rerun()

# ---------------------------------------------------------------------------
# Classification output
# ---------------------------------------------------------------------------

if classify_clicked:
    if not referral_text.strip():
        st.warning("Please paste a referral or select an example.")
    else:
        with st.spinner("Classifying..."):
            result = classify_referral(referral_text, specialty=specialty)
            missing = check_missing_info(referral_text, specialty=specialty)
            all_missing = list(set(result.missing_info + missing.missing_fields))

        st.divider()

        # Classification badge
        badge_map = {
            "URGENT": ("🔴", "red", "URGENT"),
            "ROUTINE": ("🟢", "green", "ROUTINE"),
            "NEEDS_REVIEW": ("🟡", "orange", "NEEDS REVIEW"),
        }
        icon, color, label = badge_map.get(
            result.classification, ("⚪", "gray", result.classification)
        )

        st.markdown(
            f"""
            <div style="
                background-color: {'#fde8e8' if color == 'red' else '#fef9e7' if color == 'orange' else '#e8f5e9'};
                border-left: 6px solid {'#e53935' if color == 'red' else '#f9a825' if color == 'orange' else '#43a047'};
                padding: 16px 20px;
                border-radius: 6px;
                margin-bottom: 16px;
            ">
                <span style="font-size: 1.6rem; font-weight: 700; color: {'#c62828' if color == 'red' else '#f57f17' if color == 'orange' else '#2e7d32'};">
                    {icon} {label}
                </span>
                <p style="margin-top: 8px; font-size: 1rem; color: #333;">{result.reason}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # Confidence
        st.metric("Confidence", f"{result.confidence:.0%}")

        st.divider()

        col_left, col_right = st.columns(2)

        with col_left:
            st.subheader("Extracted Keywords")
            if result.extracted_keywords:
                for kw in result.extracted_keywords:
                    st.markdown(f"- `{kw}`")
            else:
                st.caption("No keywords extracted.")

        with col_right:
            st.subheader("Missing Information")
            if all_missing:
                for item in all_missing:
                    st.markdown(f"- ⚠️ {item}")
            else:
                st.success("No missing information detected.")

        if missing.callback_prompt:
            st.divider()
            st.subheader("Suggested Callback Prompt")
            st.info(missing.callback_prompt)

        if result.model_used:
            st.caption(f"Model: {result.model_used}")

        if result.error:
            st.error(f"Error: {result.error}")
