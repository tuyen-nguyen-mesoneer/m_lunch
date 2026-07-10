#!/usr/bin/env bash
# Serve the m_lunch site locally for previewing/testing.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "Serving m_lunch at http://localhost:${PORT}/index.html"
python3 -m http.server "$PORT"
