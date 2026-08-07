#!/usr/bin/env bash
# ===========================================================================
#  Paw & Glow — Oracle idle-prevention keepalive
#
#  WHY THIS EXISTS
#  ---------------
#  Oracle reclaims Always Free instances whose 95th-percentile CPU, network
#  and memory utilization stay under 20% for 7 straight days. Light HTTP
#  pings are NOT enough to stop that — the metric is a percentile, so a few
#  tiny requests per day barely move it. This keepalive generates real,
#  sustained activity:
#
#    1. A request to the live site's /health endpoint (public traffic).
#    2. ~1 CPU core doing SHA-256 work for KEEPALIVE_MINUTES (default 5).
#
#  Run hourly (as deploy/setup_server.sh installs it), that's ≈96 minutes of
#  CPU activity per day — comfortably above the idle threshold. A real
#  client's organic visits + admin edits add on top of that.
#
#  TUNING
#  ------
#  KEEPALIVE_URL      public URL to ping (default: https://YOUR-DOMAIN.com/health)
#  KEEPALIVE_MINUTES  CPU-work minutes per run (default 5, max 60)
#  KEEPALIVE_SECONDS  test override — exact seconds instead of minutes
# ===========================================================================
set -uo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
TARGET="${KEEPALIVE_URL:-https://YOUR-DOMAIN.com/health}"
RUN_MINUTES="${KEEPALIVE_MINUTES:-5}"

RUN_SECONDS=$(( RUN_MINUTES * 60 ))
if [ -n "${KEEPALIVE_SECONDS:-}" ]; then
  RUN_SECONDS="${KEEPALIVE_SECONDS}"
fi
if [ "$RUN_SECONDS" -lt 1 ] || [ "$RUN_SECONDS" -gt 3600 ]; then
  echo "[keepalive] ignoring out-of-range duration: ${RUN_SECONDS}s" >&2
  exit 1
fi

END=$(( $(date +%s) + RUN_SECONDS ))

# 1) Public traffic through the real network interface (network metric).
if command -v curl >/dev/null 2>&1; then
  curl -fsS --max-time 30 "$TARGET" >/dev/null 2>&1 || true
fi

# 2) Sustained single-core CPU activity (CPU metric). python3 is guaranteed
#    on the server because the site itself needs it.
command -v "$PYTHON_BIN" >/dev/null 2>&1 || {
  echo "[keepalive] ${PYTHON_BIN} not found — skipping CPU work" >&2
  exit 0
}

"$PYTHON_BIN" - "$END" <<'PY' || true
import hashlib, sys, time
end = int(sys.argv[1])
chunk = b"paw-and-glow-keepalive-" * 120000  # ~3 MB buffer
while time.time() < end:
    hashlib.sha256(chunk).digest()
PY

exit 0
