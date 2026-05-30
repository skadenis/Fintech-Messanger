#!/usr/bin/env sh
# Remove Wappi debug JSONL before commit (local + optional WAPPI_LOG_DIR).
set -eu

dirs="${WAPPI_LOG_DIR:-}"
dirs="${dirs} $(cd "$(dirname "$0")/../../.." && pwd)/logs/wappi"
dirs="${dirs} /var/log/fintech-messenger/wappi"

for dir in $dirs; do
  [ -n "$dir" ] || continue
  [ -d "$dir" ] || continue
  find "$dir" -maxdepth 1 -type f \( -name 'wappi-*.jsonl' -o -name 'sync-phone-*.jsonl' \) -delete 2>/dev/null || true
done
