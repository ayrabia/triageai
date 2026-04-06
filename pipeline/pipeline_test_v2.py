"""
TriageAI Pipeline Test v2 — Three-Tier Classification
======================================================
This script runs both AWS Textract and Claude Vision (via Bedrock) 
on a referral PDF stored in your S3 bucket.

v2 UPDATE: Now uses three-tier classification:
  1. FLAGGED FOR PRIORITY REVIEW — AI found matching urgent criteria
  2. SECONDARY APPROVAL NEEDED — referring provider marked urgent but 
     AI didn't find matching criteria. Triage team should double-check.
  3. STANDARD QUEUE — no urgent criteria matched, not marked urgent

Usage:
    python pipeline_test_v2.py referral_01.pdf

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
# CONFIGURATION
# ============================================================
S3_BUCKET = "triageai-test-referrals"
AWS_REGION = "us-east-1"
CLAUDE_MODEL_ID = "us.anthropic.claude-sonnet-4-6"

# ============================================================
# ENT URGENT CRITERIA — from Nadia's interview
# ============================================================
ENT_URGENT_CRITERIA = """
Compare the referral against these ENT urgent criteria. Each criterion includes the
recommended scheduling window to include in your output when that criterion is matched:

- Confirmed or suspected cancer / malignancy → recommended window: 3-4 weeks
- Rapidly growing neck or oral lesions → recommended window: 1-2 weeks
- Nasal fractures — ONLY if injury occurred within the past 1-2 weeks (acute window).
  If the fracture is older than 2 weeks, it is PAST the surgical window and does NOT
  qualify as an urgent criterion. Do NOT flag delayed/chronic nasal fractures as Tier 1.
  → recommended window (if within window): 1-2 weeks
- Sudden hearing loss (acute onset, not gradual) → recommended window: within 1 week
- Airway compromise or obstruction → recommended window: same day / next day
- Tongue ties in infants with feeding issues → recommended window: 1-2 weeks
- Peritonsillar abscess → recommended window: same day / next day
- Foreign body in ear/nose/throat → recommended window: same day
"""

# ============================================================
# CLAUDE PROMPT v2 — Three-tier classification
# Checks BOTH clinical criteria AND provider's urgency label
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

5. PROVIDER URGENCY LABEL: Look through the document for any indication of how the 
   REFERRING PROVIDER marked this referral's urgency. Look for:
   - Priority fields (e.g., "Priority: Urgent", "Priority: 1 - URGENT", "STAT")
   - Urgency labels in the referral form header
   - Notes from the referring provider mentioning urgency
   - Insurance authorization priority status
   - Any text like "URG", "URGENT", "STAT", "ROUTINE", "REGULAR"
   
   Report exactly what you found — the label and where in the document you found it.
   If no urgency label is present, report "No urgency label found in document."

6. CRITERIA CHECK: {ENT_URGENT_CRITERIA}
   
   First, determine if any of the above clinical criteria match the referral content.
   
   Then, apply this THREE-TIER classification logic:
   
   TIER 1 — "FLAGGED FOR PRIORITY REVIEW": 
     The clinical content matches one or more urgent criteria, REGARDLESS of what 
     the referring provider labeled it. (This catches urgent cases even if the 
     provider marked it routine.)
   
   TIER 2 — "SECONDARY APPROVAL NEEDED":
     The referring provider marked the referral as urgent/stat/priority, BUT the 
     clinical content does NOT match any of the defined urgent criteria above. 
     The triage team should review to determine if the provider knows something 
     not captured in the document, or if the urgency label is incorrect.
   
   TIER 3 — "STANDARD QUEUE":
     No urgent criteria matched AND the referring provider did NOT mark it as urgent.
     This is a routine referral.
   
   For each tier, output:
   - action: the tier label
   - matched_criteria: [list which criteria matched, if any]
   - evidence: [exact text from the document that triggered each match]
   - provider_label: what the referring provider marked (urgent/routine/none found)
   - reasoning: one sentence explaining WHY this tier was assigned — specifically 
     addressing whether the AI criteria and the provider label agree or disagree

   CRITICAL RULE: The "action" field in your JSON output MUST match your reasoning.
   If your reasoning concludes that the referral should be SECONDARY APPROVAL NEEDED 
   (because the provider marked it urgent but no clinical criteria matched), then the 
   action field MUST say "SECONDARY APPROVAL NEEDED" — NOT "STANDARD QUEUE". 
   STANDARD QUEUE is ONLY for cases where no criteria matched AND the provider did 
   NOT mark it as urgent. If the provider marked it urgent and no criteria match, 
   that is ALWAYS Tier 2 (SECONDARY APPROVAL NEEDED), never Tier 3 (STANDARD QUEUE).
   Double-check your action field against your reasoning before outputting.

7. SUMMARY: A 2-3 sentence plain-language summary that a referral coordinator
   could read to quickly understand this referral without reading the full document.

8. NEXT STEPS: Based on the classification tier and the matched criteria, provide a
   one-sentence scheduling recommendation for the triage coordinator.
   - Tier 1: State the recommended window (e.g. "Schedule within 3-4 weeks per thyroid
     malignancy criteria.")
   - Tier 2: State what needs to be confirmed (e.g. "Secondary review needed — provider
     marked urgent but no ENT criteria matched.")
   - Cases requiring prerequisite tests: Note the prerequisite (e.g. "Schedule hearing
     test first; ENT appointment 15 minutes after.")
   - Tier 3: "Standard scheduling applies."

Output your response as structured JSON with these exact keys:
{{
    "referral_reason": "...",
    "relevant_clinical_findings": ["...", "..."],
    "imaging_summary": "..." or null,
    "missing_information": ["...", "..."],
    "provider_urgency_label": {{
        "label": "urgent" or "routine" or "stat" or "none found",
        "source": "where in the document this was found"
    }},
    "criteria_check": {{
        "action": "FLAGGED FOR PRIORITY REVIEW" or "SECONDARY APPROVAL NEEDED" or "STANDARD QUEUE",
        "matched_criteria": ["..."] or [],
        "evidence": ["..."] or [],
        "provider_label": "...",
        "reasoning": "...",
        "recommended_window": "the recommended scheduling window if Tier 1 (e.g. '3-4 weeks'), or null if Tier 2 or Tier 3"
    }},
    "next_steps": "Clinic-specific scheduling guidance. For Tier 1, state the recommended scheduling window based on the matched criterion. For Tier 2, describe what the triage team needs to verify before scheduling. For referrals requiring a hearing test, note that the patient should be scheduled for a hearing test first with the ENT appointment 15 minutes after. For Tier 3, standard scheduling applies.",
    "summary": "..."
}}
"""


def run_textract(s3_key):
    """
    Runs AWS Textract on a PDF stored in S3.
    Uses the async API for multi-page documents.
    """
    print("\n" + "=" * 60)
    print("RUNNING AWS TEXTRACT")
    print("=" * 60)
    
    textract = boto3.client("textract", region_name=AWS_REGION)
    
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
    Runs Claude Vision via AWS Bedrock with three-tier classification prompt.
    """
    print("\n" + "=" * 60)
    print("RUNNING CLAUDE VISION v2 (Three-Tier Classification)")
    print("=" * 60)
    
    s3 = boto3.client("s3", region_name=AWS_REGION)
    local_pdf = f"/tmp/{os.path.basename(s3_key)}"
    print(f"Downloading s3://{S3_BUCKET}/{s3_key} to {local_pdf}...")
    s3.download_file(S3_BUCKET, s3_key, local_pdf)
    
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
    
    image_content = []
    for i, img in enumerate(images):
        from io import BytesIO
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        img_bytes = buffer.getvalue()
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        
        image_content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": img_b64
            }
        })
        print(f"  Page {i + 1}: {len(img_bytes) // 1024}KB")
    
    image_content.append({
        "type": "text",
        "text": CLAUDE_PROMPT
    })
    
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
        
        try:
            clean = claude_text.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1]
                clean = clean.rsplit("```", 1)[0]
            parsed = json.loads(clean)
            return parsed
        except json.JSONDecodeError:
            print("Note: Claude's response wasn't valid JSON, returning raw text")
            return {"raw_response": claude_text}
            
    except Exception as e:
        print(f"ERROR calling Claude: {e}")
        print("\nPossible issues:")
        print("- Claude model may not be enabled in your Bedrock region")
        print("- Go to AWS Console > Bedrock > Model access > Request access to Anthropic models")
        return None


def save_results(s3_key, textract_text, claude_result):
    """
    Saves results to a JSON file.
    """
    output = {
        "file": s3_key,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "pipeline_version": "v2_three_tier",
        "textract": {
            "raw_text": textract_text,
            "character_count": len(textract_text) if textract_text else 0
        },
        "claude_vision": claude_result
    }
    
    output_dir = Path("pipeline_results/v3_redacted_final")
    output_dir.mkdir(exist_ok=True)
    
    filename = Path(s3_key).stem
    output_file = output_dir / f"{filename}_results.json"
    
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\nResults saved to: {output_file}")
    return output_file


def print_comparison(textract_text, claude_result):
    """
    Prints a summary of the three-tier classification.
    """
    print("\n" + "=" * 60)
    print("COMPARISON SUMMARY")
    print("=" * 60)
    
    print("\n--- TEXTRACT OUTPUT (first 500 chars) ---")
    if textract_text:
        print(textract_text[:500])
        if len(textract_text) > 500:
            print(f"... [{len(textract_text) - 500} more characters]")
    else:
        print("(No output)")
    
    print("\n--- CLAUDE VISION v2 OUTPUT (Three-Tier) ---")
    if claude_result and isinstance(claude_result, dict):
        if "raw_response" in claude_result:
            print(claude_result["raw_response"][:1000])
        else:
            print(f"\nReferral Reason: {claude_result.get('referral_reason', 'N/A')}")
            print(f"\nClinical Findings: {claude_result.get('relevant_clinical_findings', 'N/A')}")
            print(f"\nImaging: {claude_result.get('imaging_summary', 'None mentioned')}")
            print(f"\nMissing Info: {claude_result.get('missing_information', 'None')}")
            
            provider = claude_result.get("provider_urgency_label", {})
            print(f"\nProvider Urgency Label: {provider.get('label', 'N/A')}")
            print(f"  Found in: {provider.get('source', 'N/A')}")
            
            criteria = claude_result.get("criteria_check", {})
            action = criteria.get("action", "N/A")
            print(f"\n*** ACTION: {action} ***")
            
            if criteria.get("matched_criteria"):
                print(f"Matched Criteria: {criteria['matched_criteria']}")
                print(f"Evidence: {criteria['evidence']}")
            
            print(f"Provider Label: {criteria.get('provider_label', 'N/A')}")
            print(f"Reasoning: {criteria.get('reasoning', 'N/A')}")
            
            print(f"\nSummary: {claude_result.get('summary', 'N/A')}")
    else:
        print("(No output)")


def main():
    if len(sys.argv) < 2:
        print("Usage: python pipeline_test_v2.py <filename>")
        print("Example: python pipeline_test_v2.py Referral01.pdf")
        print(f"\nThis will process the file from your S3 bucket:")
        print(f"  s3://{S3_BUCKET}/<filename>")
        sys.exit(1)
    
    s3_key = sys.argv[1]
    print(f"\n{'=' * 60}")
    print(f"TriageAI Pipeline Test v2 (Three-Tier Classification)")
    print(f"Processing: s3://{S3_BUCKET}/{s3_key}")
    print(f"{'=' * 60}")
    
    textract_text = run_textract(s3_key)
    claude_result = run_claude_vision(s3_key)
    output_file = save_results(s3_key, textract_text, claude_result)
    print_comparison(textract_text, claude_result)
    
    print(f"\n{'=' * 60}")
    print(f"DONE — Full results saved to: {output_file}")
    print(f"{'=' * 60}")
    print("\nThree-tier classification logic:")
    print("  TIER 1 - FLAGGED FOR PRIORITY REVIEW: Clinical criteria matched (regardless of provider label)")
    print("  TIER 2 - SECONDARY APPROVAL NEEDED: Provider marked urgent but no criteria matched")
    print("  TIER 3 - STANDARD QUEUE: No criteria matched and not marked urgent")


if __name__ == "__main__":
    main()
