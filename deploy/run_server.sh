#!/usr/bin/env bash
# ===========================================================================
#  Paw & Glow — simple Linux launcher (no systemd required)
#
#  Usage:   bash deploy/run_server.sh [port]      (default: 8766)
#
#  Keeps server.py alive, restarting it if it crashes. This is the fallback
#  for hosts without systemd. On a normal VPS, prefer deploy/setup_server.sh
#  which installs a proper systemd service instead.
# ===========================================================================
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT="${1:-8766}"

command -v python3 >/dev/null 2>&1 || {
  echo "error: python3 is not installed. Run:  sudo apt-get install -y python3" >&2
  exit 1
}

python3 -c "import sys" >/dev/null 2>&1 || {
  echo "error: python3 is not working correctly on this machine." >&2
  exit 1
}

if [ ! -f server.py ]; then
  echo "error: server.py not found in $(pwd). Run this from the project folder." >&2
  exit 1
fi

mkdir -p uploads

trap 'echo; echo "[paw-and-glow] stopped."; exit 0' INT TERM

echo "[paw-and-glow] starting on 0.0.0.0:${PORT} (Ctrl+C to stop)"

while true; do
  python3 server.py "$PORT"
  code=$?
  if [ "$code" -eq 0 ]; then
    echo "[paw-and-glow] server exited cleanly. Bye."
    exit 0
  fi
  echo "[paw-and-glow] server crashed (exit ${code}); restarting in 2s..."
  sleep 2
done
