#!/usr/bin/env bash
set -euo pipefail

# Backfill Atlas ingestion in year chunks for top-20 state coverage.
# Usage:
#   ATLAS_INGEST_ADMIN_TOKEN="..." ./scripts/backfill-top20.sh [start_year] [end_year] [chunk_size]
#   ATLAS_BEARER_TOKEN="..." ./scripts/backfill-top20.sh [start_year] [end_year] [chunk_size]
# Defaults to `chunk_size=1` for safer long-range backfills.
# Optional env:
#   ATLAS_BACKFILL_STATES="IA,IL,IN" (default: full top-20 list)
#   ATLAS_BACKFILL_RUN_MACRO="1" (run national FRED + ag-index pass once at end; default 1)
#   ATLAS_INGEST_MAX_TIME="900" (seconds per ingest HTTP call; default 900)

BASE_URL="${ATLAS_BASE_URL:-https://atlas.altiratech.com}"
START_YEAR="${1:-2005}"
END_YEAR="${2:-$(date +%Y)}"
CHUNK_SIZE="${3:-1}"
DEFAULT_STATES="IA,IL,IN,NE,KS,MN,OH,WI,MO,SD,ND,TX,CA,WA,OR,ID,MT,CO,MI,PA"
STATE_LIST_CSV="${ATLAS_BACKFILL_STATES:-$DEFAULT_STATES}"
RUN_MACRO="${ATLAS_BACKFILL_RUN_MACRO:-1}"
INGEST_MAX_TIME="${ATLAS_INGEST_MAX_TIME:-900}"
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

if ! [[ "$INGEST_MAX_TIME" =~ ^[0-9]+$ ]] || (( INGEST_MAX_TIME < 30 )); then
  echo "error: ATLAS_INGEST_MAX_TIME must be an integer >= 30 seconds"
  exit 1
fi

IFS=',' read -r -a STATES <<< "$STATE_LIST_CSV"
if (( ${#STATES[@]} == 0 )); then
  echo "error: ATLAS_BACKFILL_STATES produced an empty state list"
  exit 1
fi
for i in "${!STATES[@]}"; do
  state="$(echo "${STATES[$i]}" | tr '[:lower:]' '[:upper:]' | xargs)"
  if ! [[ "$state" =~ ^[A-Z]{2}$ ]]; then
    echo "error: invalid state token '$state' in ATLAS_BACKFILL_STATES"
    exit 1
  fi
  STATES[$i]="$state"
done

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

call_ingest() {
  local url="$1"
  local label="$2"
  local status_code
  status_code="$(curl -sS -o "$tmp_body" -w '%{http_code}' -X POST "$url" \
    --connect-timeout 15 \
    --max-time "$INGEST_MAX_TIME" \
    "${ACCESS_HEADERS[@]}" \
    "${AUTH_HEADERS[@]}" \
    -H "Content-Type: application/json")"

  if [[ "$status_code" != "200" ]]; then
    echo "error: ${label} failed with HTTP ${status_code}"
    echo "response body:"
    cat "$tmp_body"
    exit 1
  fi

  cat "$tmp_body"
  echo
}

echo "Backfill target: ${BASE_URL} (${START_YEAR}-${END_YEAR}, chunk=${CHUNK_SIZE})"
echo "Auth mode: ${AUTH_MODE}"
echo "States: ${STATES[*]}"
echo "Per-request timeout: ${INGEST_MAX_TIME}s"
echo "Run macro pass (FRED + ag-index): ${RUN_MACRO}"

for (( chunk_start=START_YEAR; chunk_start<=END_YEAR; chunk_start+=CHUNK_SIZE )); do
  chunk_end=$((chunk_start + CHUNK_SIZE - 1))
  if (( chunk_end > END_YEAR )); then
    chunk_end=$END_YEAR
  fi

  for state in "${STATES[@]}"; do
    echo "→ Ingest ${state} ${chunk_start}-${chunk_end} (NASS only)"
    call_ingest \
      "${BASE_URL}/api/v1/ingest?start_year=${chunk_start}&end_year=${chunk_end}&states=${state}&include_fred=0&include_ag_index=0" \
      "ingest ${state} ${chunk_start}-${chunk_end}"
  done
done

if [[ "$RUN_MACRO" == "1" || "${RUN_MACRO,,}" == "true" || "${RUN_MACRO,,}" == "yes" ]]; then
  echo "→ Ingest macro series ${START_YEAR}-${END_YEAR} (FRED + ag-index)"
  call_ingest \
    "${BASE_URL}/api/v1/ingest?start_year=${START_YEAR}&end_year=${END_YEAR}&include_nass=0&include_fred=1&include_ag_index=1" \
    "macro ingest ${START_YEAR}-${END_YEAR}"
fi

echo "Backfill completed."
