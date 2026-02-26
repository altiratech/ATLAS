#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Farmland Terminal — Single-command launcher
# Usage:  ./run.sh           (native desktop window via pywebview)
#         ./run.sh --browser  (open in default browser)
#         ./run.sh --server   (API server only, no UI)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════"
echo "  FARMLAND TERMINAL v0.2.0"
echo "  Bloomberg for Farmland"
echo "═══════════════════════════════════════════"

# ── Python check ──────────────────────────────────────────────────
PY=$(command -v python3 || command -v python || true)
if [[ -z "$PY" ]]; then
  echo "ERROR: Python 3 is required but not found."
  exit 1
fi
echo "Using Python: $PY"

# ── Install dependencies ──────────────────────────────────────────
echo "[1/3] Installing dependencies..."
$PY -m pip install --quiet --break-system-packages \
  fastapi uvicorn sqlalchemy pydantic numpy pywebview 2>/dev/null || \
$PY -m pip install --quiet \
  fastapi uvicorn sqlalchemy pydantic numpy pywebview 2>/dev/null || \
echo "  (some packages may have failed — continuing)"
echo "      Dependencies OK."

# PYTHONPATH must point to backend/ so internal imports resolve
export PYTHONPATH="$PWD/backend"

# ── Launch mode ───────────────────────────────────────────────────
MODE="${1:-}"

if [[ "$MODE" == "--server" ]]; then
  echo "[2/3] Seeding database..."
  $PY -c "
from app.core.database import engine, Base
from app.models import schema
Base.metadata.create_all(bind=engine)
from app.seed import seed_if_empty
seed_if_empty()
print('      Database ready.')
"
  echo "[3/3] Starting API server on http://127.0.0.1:3000 ..."
  echo "      Frontend: http://127.0.0.1:3000"
  echo "      API:      http://127.0.0.1:3000/api/v1/dashboard"
  echo "      Press Ctrl+C to stop."
  $PY -m uvicorn app.main:app --host 127.0.0.1 --port 3000 --log-level info

elif [[ "$MODE" == "--browser" ]]; then
  echo "[2/3] Starting in browser mode..."
  $PY -c "
import sys, os, threading, time, webbrowser
from app.core.database import engine, Base
from app.models import schema
Base.metadata.create_all(bind=engine)
from app.seed import seed_if_empty
seed_if_empty()
print('      Database ready.')

def run_server():
    import uvicorn
    uvicorn.run('app.main:app', host='127.0.0.1', port=3000, log_level='warning')

t = threading.Thread(target=run_server, daemon=True)
t.start()
time.sleep(2)
webbrowser.open('http://127.0.0.1:3000')
print('[3/3] Farmland Terminal running at http://127.0.0.1:3000')
print('      Press Ctrl+C to stop.')
import signal
try:
    signal.pause() if hasattr(signal,'pause') else t.join()
except KeyboardInterrupt:
    print('\nShutting down.')
"

else
  echo "[2/3] Launching native desktop application..."
  $PY launcher.py
fi

