#!/usr/bin/env bash
set -euo pipefail

CANONICAL_BASE="${1:-https://atlas.altiratech.com}"
LEGACY_BASE="${2:-https://farmland.altiratech.com}"

echo "Checking domain migration"
echo "  canonical: ${CANONICAL_BASE}"
echo "  legacy:    ${LEGACY_BASE}"

legacy_headers="$(curl -sI "${LEGACY_BASE}/")"
legacy_status="$(printf '%s' "${legacy_headers}" | awk 'NR==1{print $2}')"
legacy_location="$(printf '%s' "${legacy_headers}" | awk 'BEGIN{IGNORECASE=1}/^location:/{print $2}' | tr -d '\r')"

if [[ "${legacy_status}" != "308" ]]; then
  echo "ERROR: expected legacy root status 308, got ${legacy_status}"
  exit 1
fi
if [[ "${legacy_location}" != "${CANONICAL_BASE}/"* ]]; then
  echo "ERROR: expected legacy redirect location to start with ${CANONICAL_BASE}/, got ${legacy_location}"
  exit 1
fi

legacy_api_status="$(curl -s -o /dev/null -w '%{http_code}' "${LEGACY_BASE}/api/v1/health")"
if [[ "${legacy_api_status}" != "200" ]]; then
  echo "ERROR: expected legacy API health status 200, got ${legacy_api_status}"
  exit 1
fi

canonical_status="$(curl -s -o /dev/null -w '%{http_code}' "${CANONICAL_BASE}/")"
if [[ "${canonical_status}" != "200" ]]; then
  echo "ERROR: expected canonical root status 200, got ${canonical_status}"
  exit 1
fi

home_status="$(curl -s -o /dev/null -w '%{http_code}' "${CANONICAL_BASE}/altiratech-home")"
if [[ "${home_status}" != "200" ]]; then
  echo "ERROR: expected canonical /altiratech-home status 200, got ${home_status}"
  exit 1
fi

echo "OK: migration behavior looks correct."
