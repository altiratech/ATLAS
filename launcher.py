#!/usr/bin/env python3
"""
Altira Atlas — Native Desktop Launcher
Uses pywebview to create a native window backed by the FastAPI server.
Single-command launch: python launcher.py
"""
import sys
import os
import threading
import time
import signal

# Add backend/ to path so internal imports (from app.core...) resolve correctly
ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
sys.path.insert(0, BACKEND)
os.chdir(ROOT)

HOST = "127.0.0.1"
PORT = 3000
URL = f"http://{HOST}:{PORT}"


def start_server():
    """Run the FastAPI server in a background thread."""
    import uvicorn

    # Ensure database schema exists (no synthetic seed load)
    from app.core.database import engine, Base
    from app.models import schema  # noqa: F401 — registers all models

    Base.metadata.create_all(bind=engine)

    uvicorn.run(
        "app.main:app",
        host=HOST,
        port=PORT,
        log_level="warning",
    )


def wait_for_server(timeout=15):
    """Poll until the server responds."""
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(f"{URL}/api/v1/metrics", timeout=2)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def main():
    print("═══════════════════════════════════════════")
    print("  ALTIRA ATLAS v0.2.0")
    print("  Land Intelligence + Scenario Modeling")
    print("═══════════════════════════════════════════")

    # ── Start server in background thread ──────────────────────────
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    print(f"Starting Altira Atlas server on {URL} ...")
    if not wait_for_server():
        print("ERROR: Server failed to start within 15 seconds.")
        sys.exit(1)
    print("Server ready.")

    # ── Try native window (pywebview) first, fall back to browser ──
    try:
        import webview

        window = webview.create_window(
            "Altira Atlas",
            URL,
            width=1400,
            height=900,
            min_size=(1024, 700),
            text_select=True,
        )
        webview.start(debug=False)
    except ImportError:
        print("pywebview not installed — opening in default browser.")
        import webbrowser

        webbrowser.open(URL)
        print(f"Altira Atlas running at {URL}")
        print("Press Ctrl+C to stop.")
        try:
            signal.pause() if hasattr(signal, "pause") else server_thread.join()
        except KeyboardInterrupt:
            print("\nShutting down.")
    except Exception as e:
        print(f"pywebview error: {e} — falling back to browser.")
        import webbrowser

        webbrowser.open(URL)
        print(f"Altira Atlas running at {URL}")
        print("Press Ctrl+C to stop.")
        try:
            signal.pause() if hasattr(signal, "pause") else server_thread.join()
        except KeyboardInterrupt:
            print("\nShutting down.")


if __name__ == "__main__":
    main()
