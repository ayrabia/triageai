"""
AWS Textract wrapper for extracting text from faxed referral documents.

Supports both synchronous (single-page) and asynchronous (multi-page) extraction.
All documents should be stored in S3 before processing.
"""

import os
import time
from typing import Optional

import boto3
from botocore.exceptions import ClientError


def get_textract_client():
    return boto3.client(
        "textract",
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )


def extract_text_from_s3(
    bucket: str,
    key: str,
    multi_page: bool = False,
) -> str:
    """
    Extract text from a document stored in S3.

    Args:
        bucket: S3 bucket name.
        key: S3 object key (e.g. "referrals/fax_20240315_001.pdf").
        multi_page: Use async job for multi-page PDFs.

    Returns:
        Extracted plain text string.
    """
    client = get_textract_client()

    if not multi_page:
        return _sync_extract(client, bucket, key)
    return _async_extract(client, bucket, key)


def _sync_extract(client, bucket: str, key: str) -> str:
    """Single-page synchronous extraction."""
    response = client.detect_document_text(
        Document={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    lines = [
        block["Text"]
        for block in response.get("Blocks", [])
        if block["BlockType"] == "LINE"
    ]
    return "\n".join(lines)


def _async_extract(client, bucket: str, key: str) -> str:
    """Multi-page async extraction via StartDocumentTextDetection."""
    start_response = client.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    job_id = start_response["JobId"]

    # Poll until complete
    while True:
        response = client.get_document_text_detection(JobId=job_id)
        status = response["JobStatus"]
        if status == "SUCCEEDED":
            break
        if status == "FAILED":
            raise RuntimeError(f"Textract job failed for s3://{bucket}/{key}")
        time.sleep(2)

    # Collect all pages
    lines = []
    next_token: Optional[str] = None
    while True:
        kwargs = {"JobId": job_id}
        if next_token:
            kwargs["NextToken"] = next_token
        page_response = client.get_document_text_detection(**kwargs)
        lines.extend(
            block["Text"]
            for block in page_response.get("Blocks", [])
            if block["BlockType"] == "LINE"
        )
        next_token = page_response.get("NextToken")
        if not next_token:
            break

    return "\n".join(lines)


def extract_text_from_bytes(image_bytes: bytes) -> str:
    """
    Extract text directly from image bytes (JPEG/PNG).
    Useful for single-page fax images without S3 upload.

    Args:
        image_bytes: Raw image bytes.

    Returns:
        Extracted plain text string.
    """
    client = get_textract_client()
    response = client.detect_document_text(
        Document={"Bytes": image_bytes}
    )
    lines = [
        block["Text"]
        for block in response.get("Blocks", [])
        if block["BlockType"] == "LINE"
    ]
    return "\n".join(lines)
