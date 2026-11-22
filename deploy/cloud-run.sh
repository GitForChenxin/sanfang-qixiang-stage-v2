#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-project-53603ed3-8236-40ec-90a}"
REGION="${REGION:-asia-east1}"
SERVICE="${SERVICE:-sanfang-qixiang}"
REGISTRY="${REGISTRY:-cloud-run-source-deploy}"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${REGISTRY}/${SERVICE}:$(git rev-parse --short HEAD)}"
python3 scripts/build_site.py
# Run this in authorized Cloud Shell. Build under the current user's identity so
# the default Compute service account needs no added Cloud Run Builder role.
gcloud artifacts repositories describe "$REGISTRY" --project "$PROJECT_ID" --location "$REGION" >/dev/null
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker build -t "$IMAGE" dist/cloudrun
docker push "$IMAGE"
# Keep IAM authentication enabled by default. Public sharing is a separate decision.
gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --image "$IMAGE" --port 8080 --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 1 --concurrency 40 --timeout 60 \
  --cpu-throttling --no-allow-unauthenticated
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)'
