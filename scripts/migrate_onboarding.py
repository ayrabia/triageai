"""
One-time migration: add is_active to users, criteria to clinics,
seed SacENT criteria, promote ayman to superadmin.
"""
import json, os
import psycopg2

DB_URL = os.environ['DATABASE_URL']

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
cur.execute("ALTER TABLE clinics ADD COLUMN IF NOT EXISTS criteria JSONB")

sacent_criteria = {
    "specialty": "ENT",
    "urgent_criteria": [
        "Confirmed or suspected cancer/malignancy",
        "Rapidly growing neck or oral lesions",
        "Nasal fractures (1-2 week surgical window)",
        "Sudden hearing loss",
        "Airway compromise or obstruction",
        "Tongue ties in infants with feeding issues",
        "Peritonsillar abscess",
        "Foreign body in ear/nose/throat",
    ],
}
cur.execute(
    "UPDATE clinics SET criteria = %s WHERE id = '00000000-0000-0000-0000-000000000001'",
    [json.dumps(sacent_criteria)],
)
cur.execute("UPDATE users SET role = 'superadmin' WHERE email = 'ayman@usetriageai.com'")

conn.commit()

cur.execute("SELECT email, role, is_active FROM users ORDER BY role")
print("Users:")
for row in cur.fetchall():
    print(" ", row)

cur.execute("SELECT name, criteria->>'specialty' FROM clinics")
print("Clinics:")
for row in cur.fetchall():
    print(" ", row)

cur.close()
conn.close()
print("Migration complete.")
