#!/usr/bin/env bash
# Copies VITE_MAPILLARY_TOKEN from .env.local into the GitHub Actions secret
# MAPILLARY_TOKEN without ever printing it. Uses the authenticated gh CLI.
#   bash scripts/set-mapillary-secret.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo ".env.local not found"; exit 1; }
git check-ignore -q .env.local || { echo ".env.local is not gitignored; refusing"; exit 1; }
token="$(grep -E '^VITE_MAPILLARY_TOKEN=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' \r\n')"
[ -n "$token" ] || { echo "VITE_MAPILLARY_TOKEN is empty in .env.local"; exit 1; }
case "$token" in MLY\|*) ;; *) echo "That does not look like a Mapillary client token (MLY|...); refusing"; exit 1 ;; esac
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
printf '%s' "$token" | gh secret set MAPILLARY_TOKEN --repo "$repo"
unset token
echo "MAPILLARY_TOKEN set on $repo (value not shown)"
