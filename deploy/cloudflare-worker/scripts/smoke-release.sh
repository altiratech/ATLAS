#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${ATLAS_BASE_URL:-}"
DEFAULT_URLS=(
  "https://atlas.altiratech.com"
  "https://farmland.altiratech.com"
)

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
    return 0
  fi

  for candidate in "${DEFAULT_URLS[@]}"; do
    if curl -sS --connect-timeout 8 --max-time 30 -o /dev/null -w '%{http_code}' "${candidate}/api/v1/health" | grep -q '^200$'; then
      BASE_URL="$candidate"
      return 0
    fi
  done

  echo "FAIL unable to reach health endpoint on default Atlas URLs"
  exit 1
}

pick_base_url
echo "Smoke target: ${BASE_URL}"

# Public read routes
check_status "GET" "/api/v1/health" "200"
check_status "GET" "/api/v1/meta/as-of?as_of=latest" "200"
check_status "GET" "/api/v1/data/coverage?as_of=latest&state=ALL" "200"
check_status "GET" "/api/v1/ag-index" "200"
check_status "GET" "/api/v1/dashboard?as_of=latest" "200"
check_status "GET" "/api/v1/screener?as_of=latest&state=IA" "200"

# Auth-gated behavior in production
check_status "POST" "/api/v1/auth/bootstrap" "401"
check_status "POST" "/api/v1/watchlist" "401"

# Frontend shell sanity
check_contains "/" "Altira Atlas"

echo "Smoke checks completed."
