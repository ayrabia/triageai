# ENT Urgency Criteria

This document defines the urgency classification criteria used by TriageAI for ENT (Ear, Nose & Throat) specialty referrals.

These criteria were developed in collaboration with our design partner, a 5-location ENT clinic receiving 150+ referrals per day.

> **Important:** These criteria inform the AI's suggestion only. The treating clinician makes all final triage and scheduling decisions.

---

## URGENT

Referrals classified as **URGENT** should be scheduled same-week or sooner. These represent conditions where delayed care may cause irreversible harm, disease progression, or missed treatment windows.

| Condition | Rationale |
|-----------|-----------|
| Confirmed cancer diagnosis (any type) | Staging and treatment must begin promptly |
| Suspicious or rapidly growing oral lesion | Potential malignancy; delay risks staging and survival outcomes |
| Rapidly growing neck mass (especially 3+ week progression, firmness, fixation) | High suspicion for lymphoma, squamous cell carcinoma, or other malignancy |
| Tongue tie (ankyloglossia) in infant with documented feeding difficulties or failure to thrive | Functional impact on infant nutrition; delay risks developmental consequences |
| Nasal fracture | Narrow 1–2 week surgical window for closed reduction before bone sets; after that, open rhinoplasty required |
| Sudden sensorineural hearing loss (unilateral, acute onset) | Steroid treatment window is time-sensitive; delay reduces chances of recovery |
| Airway compromise or stridor | Potential life-threatening obstruction |
| Peritonsillar abscess or deep space neck infection | Risk of airway compromise and sepsis |

---

## ROUTINE

Referrals classified as **ROUTINE** should be scheduled within the standard 4–6 week window. These represent stable conditions with no immediate risk indicators.

| Condition | Rationale |
|-----------|-----------|
| Non-growing oral lesion in a benign location (e.g., small fibroma) | Low malignancy risk; stable over time |
| Hearing loss in children — stable, bilateral, sensorineural, non-sudden | Important but not time-sensitive; hearing aids and monitoring appropriate |
| Chronic sinusitis — stable, no complications | Elective surgical management when medical therapy has failed |
| Recurrent tonsillitis meeting Paradise criteria | Elective tonsillectomy assessment |
| Stable nasal polyps | Medical management first; elective surgery if indicated |
| Routine post-operative follow-up | Ongoing care continuity |
| Ear pain without acute infection signs | Evaluation for etiology; low urgency |
| Chronic eustachian tube dysfunction | Management-based; not time-sensitive |

---

## NEEDS REVIEW

Referrals classified as **NEEDS REVIEW** cannot be accurately classified due to missing information. Staff should contact the referring clinic to obtain the missing details before scheduling.

| Missing Information | Why It Matters |
|--------------------|----------------|
| No clinical notes — only an authorization or cover sheet sent | No clinical picture available to assess urgency |
| No CT or MRI imaging (when a mass or lesion is described) | Structural detail required to assess urgency and plan |
| No lab results (when infection or malignancy is suspected) | Cannot assess severity without CBC, cultures, or pathology |
| No referring physician name or contact information | Cannot reach referring provider for clarification or updates |
| Illegible or incomplete referral | Insufficient information to classify |

---

## Callback Protocol

When a referral is classified as **NEEDS REVIEW**, staff should use the generated callback prompt to contact the referring clinic and request the missing information.

Example prompt (auto-generated):

> "Hello, I'm calling from ENT regarding a referral we received. We're missing some information needed to process this referral:
> - No clinical notes — only an authorization or cover sheet was received.
> - No referring physician contact information found.
>
> Could you please send the above information by fax or email at your earliest convenience? Thank you."

---

## Notes on Scope

TriageAI is an **administrative workflow tool**, not a clinical decision support system. The AI:

- **Does:** Surface clinical signals from referral text and suggest a priority tier
- **Does not:** Diagnose, recommend treatment, override clinician judgment, or provide medical advice

The treating clinician retains full responsibility for all triage and scheduling decisions.

---

*Last updated: 2024*
*Specialty: ENT*
*Design partner: 5-location ENT clinic (anonymized)*
