#!/usr/bin/env bash
# Refresh data locally and verify the static site. This never commits or deploys.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data
exec 9>data/event-refresh-pipeline.lock
flock -n 9 || { echo "An event refresh is already running." >&2; exit 2; }
python3 -m pytest scripts/tests -q
python3 scripts/scrape_events.py --sources uscf nachesshub boylston cca --strict "$@"
python3 scripts/review_events.py --strict
npm test
npm run typecheck
npm run build
