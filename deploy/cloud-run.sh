#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-project-53603ed3-8236-40ec-90a}"
REGION="${REGION:-asia-east1}"
SERVICE="${SERVICE:-sanfang-qixiang}"
REGISTRY="${REGISTRY:-cloud-run-source-deploy}"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${REGISTRY}/${SERVICE}:$(git rev-parse --short HEAD)}"
BUILD_MODE="${BUILD_MODE:-source}"
python3 scripts/build_site.py
if [ "$BUILD_MODE" = "docker" ]; then
  # Optional: requires a working Docker daemon and direct registry connectivity.
  gcloud artifacts repositories describe "$REGISTRY" --project "$PROJECT_ID" --location "$REGION" >/dev/null
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  docker build -t "$IMAGE" dist/cloudrun
  docker push "$IMAGE"
  DEPLOY_SOURCE=(--image "$IMAGE")
elif [ "$BUILD_MODE" = "source" ]; then
  # Default: managed build; the build account needs the approved run.builder role.
  DEPLOY_SOURCE=(--source dist/cloudrun)
else
  echo 'BUILD_MODE must be source or docker' >&2
  exit 2
fi
# Keep IAM authentication enabled by default. Public sharing is a separate decision.
gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  "${DEPLOY_SOURCE[@]}" --port 8080 --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 1 --concurrency 40 --timeout 60 \
  --cpu-throttling --no-allow-unauthenticated
gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)'
