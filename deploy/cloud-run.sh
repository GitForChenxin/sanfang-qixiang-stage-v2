#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-project-53603ed3-8236-40ec-90a}"
REGION="${REGION:-asia-east1}"
SERVICE="${SERVICE:-sanfang-qixiang}"
python3 scripts/build_site.py
# Keep IAM authentication enabled by default. Public sharing is a separate decision.
gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --source dist/cloudrun --port 8080 --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 1 --concurrency 40 --timeout 60 \
  --cpu-throttling --no-allow-unauthenticated
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)'
