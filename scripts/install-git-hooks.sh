#!/usr/bin/env sh
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$root/.git/hooks"
cp "$root/.githooks/pre-commit" "$root/.git/hooks/pre-commit"
chmod +x "$root/.git/hooks/pre-commit" "$root/apps/backend/scripts/clean-wappi-logs.sh"
echo "Installed pre-commit hook (cleans Wappi JSONL logs)."
