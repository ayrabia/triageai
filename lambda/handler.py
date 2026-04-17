"""
TriageAI Lambda handler — pipeline entry point.

Triggered by S3 ObjectCreated events on the triageai-test-referrals bucket
(prefix: ui-uploads/). Runs the v3 classification pipeline and writes results
to RDS.

Key design decisions:
  - 3-retry loop on DB lookup: S3 event can fire before the upload Route Handler
    commits the referral row. 3 attempts × 1s sleep handles typical commit latency.
  - /tmp cleanup after each invocation: Lambda containers are reused; stale PDFs
    waste space and can cause issues on warm invocations.
  - Bedrock timeout patched in pipeline/run.py: default boto3 socket read timeout
    is 60s which can be exceeded on multi-page PDFs with slow Bedrock responses.
"""

import os
import time
import uuid as uuid_lib
from pathlib import Path
from urllib.parse import unquote_plus

from db.session import SessionLocal
from db.models import Referral
from pipeline.run import process_referral


def _extract_uuid_from_key(s3_key: str) -> uuid_lib.UUID | None:
    """
    Extract a UUID from keys in the format 'ui-uploads/<uuid>.pdf'.
    Returns None if the key stem is not a valid UUID.
    """
    try:
        stem = Path(s3_key).stem
        return uuid_lib.UUID(stem)
    except (ValueError, AttributeError):
        return None


def _lookup_referral_id_by_key(s3_key: str) -> uuid_lib.UUID | None:
    """
    Fall back to a DB lookup when the UUID can't be parsed from the key.
    Used for fax webhook uploads where the key format may differ.
    """
    from sqlalchemy import text
    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT id FROM referrals WHERE s3_key = :key LIMIT 1"),
            {"key": s3_key},
        ).fetchone()
        return uuid_lib.UUID(str(row[0])) if row else None
    finally:
        db.close()


def _wait_for_referral(referral_id: uuid_lib.UUID, max_attempts: int = 3) -> bool:
    """
    Wait for the referral DB row to exist.

    The upload Route Handler writes to S3 then commits to RDS. Lambda fires on
    the S3 PUT, which can race the DB commit by ~100-500ms. Retry 3 times with
    1s sleep before giving up.

    Returns True if the row was found, False if it never appeared.
    """
    for attempt in range(max_attempts):
        db = SessionLocal()
        try:
            referral = db.get(Referral, referral_id)
            if referral is not None:
                return True
        finally:
            db.close()
        if attempt < max_attempts - 1:
            time.sleep(1)
    return False


def _cleanup_tmp(s3_key: str, referral_id: uuid_lib.UUID) -> None:
    """Remove files written to /tmp during pipeline execution."""
    for path in [
        f"/tmp/{Path(s3_key).name}",
        f"/tmp/{referral_id}.pdf",
    ]:
        try:
            Path(path).unlink(missing_ok=True)
        except Exception:
            pass


def main(event: dict, context) -> dict:
    """
    Lambda handler — processes one S3 event record at a time.

    AWS delivers S3 events in batches (Records list), but for our use case
    each upload triggers a single pipeline run so batches are typically size 1.
    We process all records in the batch defensively.
    """
    for record in event.get("Records", []):
        raw_key = record["s3"]["object"]["key"]
        s3_key = unquote_plus(raw_key)  # S3 events URL-encode keys

        print(f"[pipeline] received s3_key={s3_key}")

        # Try to extract referral_id from the key (ui-uploads/<uuid>.pdf)
        referral_id = _extract_uuid_from_key(s3_key)

        # If key doesn't contain a UUID, fall back to a DB lookup by s3_key
        if referral_id is None:
            referral_id = _lookup_referral_id_by_key(s3_key)

        if referral_id is None:
            print(f"[pipeline] could not resolve referral_id for s3_key={s3_key}, skipping")
            continue

        # Wait for the DB row to be committed (race condition mitigation)
        if not _wait_for_referral(referral_id):
            print(f"[pipeline] referral {referral_id} not found in DB after retries, skipping")
            continue

        try:
            process_referral(referral_id, s3_key)
            print(f"[pipeline] completed referral_id={referral_id}")
        except Exception as exc:
            # process_referral handles its own error state (marks FAILED in DB)
            # We log here for CloudWatch visibility but do not re-raise —
            # re-raising would cause Lambda to retry and double-process.
            print(f"[pipeline] error processing referral_id={referral_id}: {type(exc).__name__}")
        finally:
            _cleanup_tmp(s3_key, referral_id)

    return {"statusCode": 200}
