"""
scripts/run_edge.py

QualiEdge Unified Edge Orchestration Launcher.
Starts both the Python Edge API Server (Port 8000) and the React Vite Dashboard (Port 3000)
with unified process management, health checking, and graceful shutdown.
"""

import os
import sys
import time
import signal
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

# Detect Python interpreter
UV_PYTHON = Path(os.environ.get("APPDATA", "")) / "uv" / "python" / "cpython-3.11.17-windows-x86_64-none" / "python.exe"
if UV_PYTHON.exists():
    PYTHON_EXE = str(UV_PYTHON)
else:
    PYTHON_EXE = sys.executable

# Detect Node.js
USER_LOCAL_NODE = Path(os.environ.get("USERPROFILE", "")) / ".local" / "node"
ENV = os.environ.copy()
if USER_LOCAL_NODE.exists():
    ENV["PATH"] = f"{USER_LOCAL_NODE};{ENV.get('PATH', '')}"


def main():
    print("=" * 70)
    print("QualiEdge Industrial Inspection Platform - Unified Edge Launcher")
    print("=" * 70)
    print(f"[Launcher] Root Directory: {ROOT_DIR}")
    print(f"[Launcher] Python Interpreter: {PYTHON_EXE}")

    # 1. Start Python Edge API Server (Port 8000)
    backend_script = ROOT_DIR / "backend" / "main.py"
    print(f"[Launcher] Starting Backend API Server on http://127.0.0.1:8000 ...")
    backend_proc = subprocess.Popen(
        [PYTHON_EXE, str(backend_script)],
        cwd=str(ROOT_DIR),
        env=ENV
    )

    # Allow backend to bind socket
    time.sleep(1.5)

    # 2. Start Vite Frontend (Port 3000)
    print(f"[Launcher] Starting Vite React Dashboard on http://localhost:3000 ...")
    if os.name == "nt":
        frontend_proc = subprocess.Popen(
            ["cmd", "/c", "npm run dev"],
            cwd=str(ROOT_DIR),
            env=ENV
        )
    else:
        frontend_proc = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(ROOT_DIR),
            env=ENV
        )

    print("\n[Launcher] System Running!")
    print("  -> Backend API:   http://127.0.0.1:8000 (Swagger docs at /docs if FastAPI active)")
    print("  -> Frontend HMI:  http://localhost:3000")
    print("Press Ctrl+C to terminate both servers.\n")

    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print("[Launcher] Backend exited unexpectedly.")
                break
            if frontend_proc.poll() is not None:
                print("[Launcher] Frontend exited unexpectedly.")
                break
    except KeyboardInterrupt:
        print("\n[Launcher] Shutting down QualiEdge Edge services...")
    finally:
        if backend_proc.poll() is None:
            backend_proc.terminate()
        if frontend_proc.poll() is None:
            frontend_proc.terminate()
        print("[Launcher] All edge services stopped cleanly.")


if __name__ == "__main__":
    main()
