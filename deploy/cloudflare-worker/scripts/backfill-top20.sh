#!/usr/bin/env bash
set -euo pipefail

# Backfill Atlas ingestion in year chunks for top-20 state coverage.
# Usage:
#   ATLAS_INGEST_ADMIN_TOKEN="..." ./scripts/backfill-top20.sh [start_year] [end_year] [chunk_size]
#   ATLAS_BEARER_TOKEN="..." ./scripts/backfill-top20.sh [start_year] [end_year] [chunk_size]

BASE_URL="${ATLAS_BASE_URL:-https://atlas.altiratech.com}"
START_YEAR="${1:-2005}"
END_YEAR="${2:-$(date +%Y)}"
CHUNK_SIZE="${3:-5}"
tmp_body="$(mktemp)"

cleanup() {
  rm -f "$tmp_body"
}
trap cleanup EXIT

if [[ -z "${ATLAS_INGEST_ADMIN_TOKEN:-}" && -z "${ATLAS_BEARER_TOKEN:-}" ]]; then
  echo "error: set ATLAS_INGEST_ADMIN_TOKEN or ATLAS_BEARER_TOKEN"
  exit 1
fi

if ! [[ "$START_YEAR" =~ ^[0-9]{4}$ && "$END_YEAR" =~ ^[0-9]{4}$ ]]; then
  echo "error: start_year and end_year must be 4-digit years"
  exit 1
fi

if (( START_YEAR > END_YEAR )); then
  echo "error: start_year must be <= end_year"
  exit 1
fi

if ! [[ "$CHUNK_SIZE" =~ ^[0-9]+$ ]] || (( CHUNK_SIZE < 1 )); then
  echo "error: chunk_size must be a positive integer"
  exit 1
fi

AUTH_MODE="session_bearer"
AUTH_HEADERS=()
if [[ -n "${ATLAS_INGEST_ADMIN_TOKEN:-}" ]]; then
  AUTH_MODE="ingest_admin_token"
  AUTH_HEADERS=(-H "X-Atlas-Ingest-Token: ${ATLAS_INGEST_ADMIN_TOKEN}")
else
  AUTH_HEADERS=(-H "Authorization: Bearer ${ATLAS_BEARER_TOKEN}")
fi

ACCESS_HEADERS=()
if [[ -n "${ATLAS_CF_ACCESS_CLIENT_ID:-}" || -n "${ATLAS_CF_ACCESS_CLIENT_SECRET:-}" ]]; then
  if [[ -z "${ATLAS_CF_ACCESS_CLIENT_ID:-}" || -z "${ATLAS_CF_ACCESS_CLIENT_SECRET:-}" ]]; then
    echo "error: set both ATLAS_CF_ACCESS_CLIENT_ID and ATLAS_CF_ACCESS_CLIENT_SECRET, or neither"
    exit 1
  fi
  ACCESS_HEADERS=(
    -H "CF-Access-Client-Id: ${ATLAS_CF_ACCESS_CLIENT_ID}"
    -H "CF-Access-Client-Secret: ${ATLAS_CF_ACCESS_CLIENT_SECRET}"
  )
fi

echo "Backfill target: ${BASE_URL} (${START_YEAR}-${END_YEAR}, chunk=${CHUNK_SIZE})"
echo "Auth mode: ${AUTH_MODE}"

for (( chunk_start=START_YEAR; chunk_start<=END_YEAR; chunk_start+=CHUNK_SIZE )); do
  chunk_end=$((chunk_start + CHUNK_SIZE - 1))
  if (( chunk_end > END_YEAR )); then
    chunk_end=$END_YEAR
  fi

  echo "→ Ingest ${chunk_start}-${chunk_end}"
  status_code="$(curl -sS -o "$tmp_body" -w '%{http_code}' -X POST "${BASE_URL}/api/v1/ingest?start_year=${chunk_start}&end_year=${chunk_end}" \
    "${ACCESS_HEADERS[@]}" \
    "${AUTH_HEADERS[@]}" \
    -H "Content-Type: application/json")"

  if [[ "$status_code" != "200" ]]; then
    echo "error: ingest ${chunk_start}-${chunk_end} failed with HTTP ${status_code}"
    echo "response body:"
    cat "$tmp_body"
    exit 1
  fi

  cat "$tmp_body"
  echo

done

echo "Backfill completed."
