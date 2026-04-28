"""
Local classifier test — runs PDFs through the pipeline prompt without touching the DB.
Uses the same _build_system_prompt, _CLASSIFY_TOOL, and _call_claude as production.

Usage: python classify_local.py <pdf_dir>
"""
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from pipeline.run import (
    _DEFAULT_CRITERIA,
    _build_system_prompt,
    _call_claude,
    _pdf_to_images_from_path,
)


def classify(pdf_path: str) -> dict:
    images = _pdf_to_images_from_path(pdf_path)
    system_prompt = _build_system_prompt(_DEFAULT_CRITERIA)
    return _call_claude(images, system_prompt)


def main():
    pdf_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    pdfs = sorted(pdf_dir.glob("*.pdf"))
    if not pdfs:
        print("No PDFs found.")
        return

    for pdf in pdfs:
        print(f"\n{'='*70}")
        print(f"FILE: {pdf.name}")
        print("="*70)
        try:
            r = classify(str(pdf))
            print(f"ACTION:          {r.get('action', 'UNKNOWN')}")
            print(f"PROVIDER LABEL:  {r.get('provider_label', '?')}")
            print(f"MATCHED:         {r.get('matched_criteria') or 'none'}")
            print(f"REASONING:       {r.get('reasoning', '')}")
            print(f"REFERRAL REASON: {r.get('referral_reason', '')}")
        except Exception as e:
            print(f"ERROR: {e}")


if __name__ == "__main__":
    main()
