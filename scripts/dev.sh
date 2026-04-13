#!/usr/bin/env bash
# 一鍵啟動 backend + frontend 開發伺服器（需已執行過 uv sync / npm install）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  jobs -p | xargs -I{} kill {} 2>/dev/null || true
}
trap cleanup EXIT INT TERM

( cd "$ROOT/backend"  && uv run uvicorn app:app --port 8000 --reload ) &
( cd "$ROOT/frontend" && npm run dev ) &

wait
