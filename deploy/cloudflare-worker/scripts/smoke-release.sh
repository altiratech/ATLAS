#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${ATLAS_BASE_URL:-}"
DEFAULT_URLS=(
  "https://atlas.altiratech.com"
  "https://farmland.altiratech.com"
)
HEALTH_STATUS=""

tmp_body="$(mktemp)"
cleanup() {
  rm -f "$tmp_body"
}
trap cleanup EXIT

check_status() {
  local method="$1"
  local path="$2"
  local expected="$3"
  shift 3

  local url="${BASE_URL}${path}"
  local code
  code="$(curl -sS --connect-timeout 8 --max-time 30 -o "$tmp_body" -w '%{http_code}' -X "$method" "$url" "$@")"

  if [[ "$code" != "$expected" ]]; then
    echo "FAIL ${method} ${path} expected=${expected} got=${code}"
    echo "Body:"
    cat "$tmp_body"
    echo
    exit 1
  fi

  echo "PASS ${method} ${path} -> ${code}"
}

check_contains() {
  local path="$1"
  local expected_text="$2"
  local url="${BASE_URL}${path}"

  curl -sS --connect-timeout 8 --max-time 30 "$url" >"$tmp_body"
  if ! grep -q "$expected_text" "$tmp_body"; then
    echo "FAIL GET ${path} missing expected text: ${expected_text}"
    exit 1
  fi

  echo "PASS GET ${path} contains '${expected_text}'"
}

pick_base_url() {
  if [[ -n "$BASE_URL" ]]; then
    HEALTH_STATUS="$(curl -sS --connect-timeout 8 --max-time 30 -o /dev/null -w '%{http_code}' "${BASE_URL}/api/v1/health")"
    return 0
  fi

  for candidate in "${DEFAULT_URLS[@]}"; do
    local code
    code="$(curl -sS --connect-timeout 8 --max-time 30 -o /dev/null -w '%{http_code}' "${candidate}/api/v1/health")"
    if [[ "$code" == "200" || "$code" == "302" ]]; then
      BASE_URL="$candidate"
      HEALTH_STATUS="$code"
      return 0
    fi
  done

  echo "FAIL unable to reach health endpoint on default Atlas URLs"
  exit 1
}

pick_base_url
echo "Smoke target: ${BASE_URL}"

if [[ "${HEALTH_STATUS}" == "302" ]]; then
  echo "Detected edge auth redirect mode (Cloudflare Access)."
  check_status "GET" "/api/v1/health" "302"
  check_status "POST" "/api/v1/auth/bootstrap" "302"
  check_status "POST" "/api/v1/watchlist" "302"
  check_status "POST" "/api/v1/ingest" "302"
  check_status "GET" "/" "302"
  echo "Smoke checks completed."
  exit 0
fi

# Public read routes
check_status "GET" "/api/v1/health" "200"
check_status "GET" "/api/v1/meta/as-of?as_of=latest" "200"
check_status "GET" "/api/v1/data/coverage?as_of=latest&state=ALL" "200"
check_status "GET" "/api/v1/data-freshness" "200"
check_status "GET" "/api/v1/ag-index" "200"

# Auth-gated behavior in production
check_status "POST" "/api/v1/auth/bootstrap" "401"
check_status "POST" "/api/v1/watchlist" "401"
check_status "POST" "/api/v1/ingest" "401"

# Frontend shell sanity
check_contains "/" "Altira Atlas"

echo "Smoke checks completed."
