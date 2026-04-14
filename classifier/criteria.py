"""
ENT urgent criteria — single source of truth.

Imported by both the text-based classifier (classifier/prompts.py)
and the vision-based pipeline (pipeline/pipeline_test_v2.py).
Defined by Nadia Rabia, Referral Coordinator at SacENT.
"""

ENT_URGENT_CRITERIA = """
Compare the referral against these ENT urgent criteria. Each criterion includes the
recommended scheduling window to include in your output when that criterion is matched:

- Confirmed or suspected cancer / malignancy → recommended window: 3-4 weeks
- Rapidly growing neck or oral lesions → recommended window: 1-2 weeks
- Nasal fractures — ONLY if injury occurred within the past 1-2 weeks (acute window).
  If the fracture is older than 2 weeks, it is PAST the surgical window and does NOT
  qualify as an urgent criterion. Do NOT flag delayed/chronic nasal fractures as urgent.
  → recommended window (if within window): 1-2 weeks
- Sudden hearing loss (acute onset, not gradual) → recommended window: within 1 week
- Airway compromise or obstruction → recommended window: same day / next day
- Tongue ties in infants with feeding issues → recommended window: 1-2 weeks
- Peritonsillar abscess → recommended window: same day / next day
- Foreign body in ear/nose/throat → recommended window: same day
"""
