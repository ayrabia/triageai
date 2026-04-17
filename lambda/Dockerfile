# Lambda container image for the TriageAI pipeline.
#
# Uses python:3.11-slim (Debian) rather than the AWS Lambda base image
# because we need poppler-utils via apt-get — the same package that works
# in the backend Dockerfile. The Lambda Runtime Interface Client (awslambdaric)
# bridges the Debian image with the Lambda execution environment.

FROM python:3.11-slim

# poppler-utils is required by pdf2image to convert PDF pages to JPEG
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/task

COPY requirements-lambda.txt .
RUN pip install --no-cache-dir awslambdaric -r requirements-lambda.txt

# Copy only the directories the pipeline needs — not app/, frontend/, alembic/
COPY pipeline/ pipeline/
COPY db/ db/
COPY classifier/ classifier/
COPY lambda/handler.py handler.py

# Lambda Runtime Interface Client entry point
ENTRYPOINT ["/usr/local/bin/python", "-m", "awslambdaric"]
CMD ["handler.main"]
