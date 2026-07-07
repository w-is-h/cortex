#!/usr/bin/env bash
# Start cortex: build the SPA if needed, serve everything from one uvicorn.
# Usage: ./start.sh [--build] [port]     (default port 8000)
set -euo pipefail
cd "$(dirname "$0")"

BUILD=0
PORT=8000
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    *) PORT="$arg" ;;
  esac
done

if [[ ! -d frontend/node_modules ]]; then
  (cd frontend && npm install)
fi
if [[ $BUILD -eq 1 || ! -d frontend/dist ]]; then
  (cd frontend && npm run build)
fi

echo "cortex on http://localhost:$PORT"
exec uv run uvicorn cortex.main:app --host 0.0.0.0 --port "$PORT"
