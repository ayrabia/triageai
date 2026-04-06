"""
TriageAI Pipeline Test — Textract vs Claude Vision
===================================================
This script runs both AWS Textract and Claude Vision (via Bedrock) 
on a referral PDF stored in your S3 bucket, then saves the results 
side by side so you can compare extraction quality.

Usage:
    python pipeline_test.py referral_01.pdf

Prerequisites:
    pip install boto3 pdf2image Pillow
    brew install poppler  (needed by pdf2image to convert PDF pages to images)
    AWS CLI configured with your TriageAI credentials
"""

import boto3
import json
import sys
import time
import base64
import os
from pathlib import Path

# ============================================================
# CONFIGURATION — update these if your setup differs
# ============================================================
S3_BUCKET = "triageai-test-referrals"
AWS_REGION = "us-east-1"
# Claude model via Bedrock — Sonnet is the best balance of cost/quality
CLAUDE_MODEL_ID = "us.anthropic.claude-sonnet-4-6"

# ============================================================
# ENT URGENT CRITERIA — from Nadia's interview
# This is what Claude checks each referral against
# ============================================================
ENT_URGENT_CRITERIA = """
Compare the referral against these ENT urgent criteria:
- Confirmed or suspected cancer / malignancy
- Rapidly growing neck or oral lesions
- Nasal fractures (1-2 week surgical window)
- Sudden hearing loss
- Airway compromise or obstruction
- Tongue ties in infants with feeding issues
- Peritonsillar abscess
- Foreign body in ear/nose/throat
"""

# ============================================================
# CLAUDE PROMPT — uses "secondary approval" framing
# Separates problem list from referral reason (Nadia's key concern)
# ============================================================
CLAUDE_PROMPT = f"""You are reviewing a faxed medical referral for an ENT specialty clinic.

IMPORTANT DISTINCTION: Referral documents often contain the patient's ENTIRE medical history 
(problem list) mixed in with the actual reason for the referral. You must carefully separate these.

For this referral, extract and organize the following information:

1. REFERRAL REASON: What is the SPECIFIC reason this patient was referred to ENT? 
   This is NOT the same as their medical history. Look for the chief complaint, 
   reason for consultation, or the specific ENT issue that prompted the referral.

2. RELEVANT CLINICAL FINDINGS: Key symptoms, exam findings, and history that are 
   DIRECTLY RELATED to the referral reason only. Ignore unrelated conditions from 
   the problem list (e.g., diabetes or hypertension are not relevant to an ENT referral 
   unless they affect the ENT condition).

3. IMAGING SUMMARY: If any imaging (CT, MRI, X-ray) is mentioned:
   - Summarize the key findings/impressions
   - If imaging is referenced but the actual report is NOT attached, flag it as: 
     "MISSING: [type of imaging] referenced but report not included"

4. MISSING INFORMATION: What expected documents or data are absent? Common missing items:
   - CT/MRI reports
   - Lab results
   - Complete clinical notes (vs just an authorization)
   - Referring physician contact info
   - Insurance information

5. CRITERIA CHECK: {ENT_URGENT_CRITERIA}
   
   If ANY criteria match, output:
   - action: "FLAGGED FOR PRIORITY REVIEW"  
   - matched_criteria: [list which criteria matched]
   - evidence: [exact text from the document that triggered each match]
   
   If NO criteria match, output:
   - action: "STANDARD QUEUE"

6. SUMMARY: A 2-3 sentence plain-language summary that a referral coordinator 
   could read to quickly understand this referral without reading the full document.

Output your response as structured JSON with these exact keys:
{{
    "referral_reason": "...",
    "relevant_clinical_findings": ["...", "..."],
    "imaging_summary": "..." or null,
    "missing_information": ["...", "..."],
    "criteria_check": {{
        "action": "FLAGGED FOR PRIORITY REVIEW" or "STANDARD QUEUE",
        "matched_criteria": ["..."] or [],
        "evidence": ["..."] or []
    }},
    "summary": "..."
}}
"""


def run_textract(s3_key):
    """
    Runs AWS Textract on a PDF stored in S3.
    
    What Textract does:
    - Takes the PDF from S3
    - Uses OCR (Optical Character Recognition) to read all text
    - Returns every line of text it found, plus any tables and forms
    
    For multi-page PDFs, we use the async API (StartDocumentTextDetection)
    because the sync API only handles single-page documents.
    """
    print("\n" + "=" * 60)
    print("RUNNING AWS TEXTRACT")
    print("=" * 60)
    
    textract = boto3.client("textract", region_name=AWS_REGION)
    
    # Start an async text detection job
    # This tells Textract: "here's a PDF in S3, start processing it"
    print(f"Starting Textract job on s3://{S3_BUCKET}/{s3_key}...")
    response = textract.start_document_text_detection(
        DocumentLocation={
            "S3Object": {
                "Bucket": S3_BUCKET,
                "Name": s3_key
            }
        }
    )
    
    job_id = response["JobId"]
    print(f"Job ID: {job_id}")
    print("Waiting for Textract to finish processing...")
    
    # Poll until the job completes
    # Textract processes asynchronously — it takes a few seconds to minutes
    while True:
        result = textract.get_document_text_detection(JobId=job_id)
        status = result["JobStatus"]
        
        if status == "SUCCEEDED":
            print("Textract job completed successfully!")
            break
        elif status == "FAILED":
            print(f"Textract job FAILED: {result.get('StatusMessage', 'Unknown error')}")
            return None
        else:
            print(f"  Status: {status}... waiting 5 seconds")
            time.sleep(5)
    
    # Collect all text from all pages
    # Textract returns results in pages (pagination), so we need to loop
    all_text = []
    pages_processed = 0
    next_token = None
    
    while True:
        if next_token:
            result = textract.get_document_text_detection(
                JobId=job_id, NextToken=next_token
            )
        
        for block in result.get("Blocks", []):
            if block["BlockType"] == "LINE":
                all_text.append(block["Text"])
                page_num = block.get("Page", 0)
                if page_num > pages_processed:
                    pages_processed = page_num
        
        next_token = result.get("NextToken")
        if not next_token:
            break
    
    full_text = "\n".join(all_text)
    print(f"\nTextract extracted {len(all_text)} lines from {pages_processed} pages")
    print(f"Total characters: {len(full_text)}")
    
    return full_text


def run_claude_vision(s3_key):
    """
    Runs Claude Vision via AWS Bedrock on a PDF stored in S3.
    
    What this does:
    - Downloads the PDF from S3
    - Converts each page to a JPEG image
    - Sends the images to Claude with our ENT triage prompt
    - Claude reads the images (OCR), extracts clinical entities, 
      and classifies urgency — all in one API call
    
    This is the "VLM-first" approach from our pipeline research:
    one call replaces Textract + Comprehend Medical + classifier.
    """
    print("\n" + "=" * 60)
    print("RUNNING CLAUDE VISION (via AWS Bedrock)")
    print("=" * 60)
    
    # Download the PDF from S3 to a temp file
    s3 = boto3.client("s3", region_name=AWS_REGION)
    local_pdf = f"/tmp/{os.path.basename(s3_key)}"
    print(f"Downloading s3://{S3_BUCKET}/{s3_key} to {local_pdf}...")
    s3.download_file(S3_BUCKET, s3_key, local_pdf)
    
    # Convert PDF pages to JPEG images
    # Claude Vision can't read PDFs directly — it needs images
    print("Converting PDF pages to images...")
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(local_pdf, dpi=200, fmt="jpeg")
        print(f"Converted {len(images)} pages to images")
    except Exception as e:
        print(f"ERROR converting PDF: {e}")
        print("Make sure you've installed poppler: brew install poppler")
        print("And pdf2image: pip install pdf2image")
        return None
    
    # Encode each page image as base64
    # This is how you send images to Claude via the API
    image_content = []
    for i, img in enumerate(images):
        # Save to bytes
        from io import BytesIO
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        img_bytes = buffer.getvalue()
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        
        # Add to the message content
        image_content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": img_b64
            }
        })
        print(f"  Page {i + 1}: {len(img_bytes) // 1024}KB")
    
    # Add the prompt text after all images
    image_content.append({
        "type": "text",
        "text": CLAUDE_PROMPT
    })
    
    # Call Claude via Bedrock
    print(f"\nSending {len(images)} page images to Claude ({CLAUDE_MODEL_ID})...")
    print("This may take 15-30 seconds depending on document length...")
    
    bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)
    
    try:
        response = bedrock.invoke_model(
            modelId=CLAUDE_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4096,
                "messages": [
                    {
                        "role": "user",
                        "content": image_content
                    }
                ]
            })
        )
        
        result = json.loads(response["body"].read())
        claude_text = result["content"][0]["text"]
        print("Claude Vision completed successfully!")
        
        # Try to parse as JSON
        try:
            # Claude sometimes wraps JSON in markdown code blocks
            clean = claude_text.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1]  # remove first line
                clean = clean.rsplit("```", 1)[0]  # remove last ```
            parsed = json.loads(clean)
            return parsed
        except json.JSONDecodeError:
            print("Note: Claude's response wasn't valid JSON, returning raw text")
            return {"raw_response": claude_text}
            
    except Exception as e:
        print(f"ERROR calling Claude: {e}")
        print("\nPossible issues:")
        print("- Claude model may not be enabled in your Bedrock region")
        print("- Go to AWS Console → Bedrock → Model access → Request access to Anthropic models")
        return None


def save_results(s3_key, textract_text, claude_result):
    """
    Saves both results to a JSON file for comparison.
    This becomes your first benchmark dataset.
    """
    output = {
        "file": s3_key,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "textract": {
            "raw_text": textract_text,
            "character_count": len(textract_text) if textract_text else 0
        },
        "claude_vision": claude_result
    }
    
    output_dir = Path("pipeline_results")
    output_dir.mkdir(exist_ok=True)
    
    filename = Path(s3_key).stem
    output_file = output_dir / f"{filename}_results.json"
    
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\nResults saved to: {output_file}")
    return output_file


def print_comparison(textract_text, claude_result):
    """
    Prints a side-by-side summary so you can quickly see the difference.
    """
    print("\n" + "=" * 60)
    print("COMPARISON SUMMARY")
    print("=" * 60)
    
    # Textract summary
    print("\n--- TEXTRACT OUTPUT (first 500 chars) ---")
    if textract_text:
        print(textract_text[:500])
        if len(textract_text) > 500:
            print(f"... [{len(textract_text) - 500} more characters]")
    else:
        print("(No output)")
    
    # Claude summary
    print("\n--- CLAUDE VISION OUTPUT ---")
    if claude_result and isinstance(claude_result, dict):
        if "raw_response" in claude_result:
            print(claude_result["raw_response"][:1000])
        else:
            print(f"\nReferral Reason: {claude_result.get('referral_reason', 'N/A')}")
            print(f"\nClinical Findings: {claude_result.get('relevant_clinical_findings', 'N/A')}")
            print(f"\nImaging: {claude_result.get('imaging_summary', 'None mentioned')}")
            print(f"\nMissing Info: {claude_result.get('missing_information', 'None')}")
            
            criteria = claude_result.get("criteria_check", {})
            action = criteria.get("action", "N/A")
            print(f"\n*** ACTION: {action} ***")
            if criteria.get("matched_criteria"):
                print(f"Matched: {criteria['matched_criteria']}")
                print(f"Evidence: {criteria['evidence']}")
            
            print(f"\nSummary: {claude_result.get('summary', 'N/A')}")
    else:
        print("(No output)")


def main():
    if len(sys.argv) < 2:
        print("Usage: python pipeline_test.py <filename>")
        print("Example: python pipeline_test.py referral_01.pdf")
        print("\nThis will process the file from your S3 bucket:")
        print(f"  s3://{S3_BUCKET}/<filename>")
        sys.exit(1)
    
    s3_key = sys.argv[1]
    print(f"\n{'=' * 60}")
    print(f"TriageAI Pipeline Test")
    print(f"Processing: s3://{S3_BUCKET}/{s3_key}")
    print(f"{'=' * 60}")
    
    # Step 1: Run Textract
    textract_text = run_textract(s3_key)
    
    # Step 2: Run Claude Vision
    claude_result = run_claude_vision(s3_key)
    
    # Step 3: Save results
    output_file = save_results(s3_key, textract_text, claude_result)
    
    # Step 4: Print comparison
    print_comparison(textract_text, claude_result)
    
    print(f"\n{'=' * 60}")
    print(f"DONE — Full results saved to: {output_file}")
    print(f"{'=' * 60}")
    print("\nNext steps:")
    print("1. Review the Claude output — does the referral reason make sense?")
    print("2. Check if it correctly separated problem list from referral reason")
    print("3. Verify the criteria check — should this be flagged for priority review?")
    print("4. Show the output to Nadia for validation")
    print("5. Run on all 6 referrals: for f in referral_*.pdf; do python pipeline_test.py $f; done")


if __name__ == "__main__":
    main()
