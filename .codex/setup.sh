#!/usr/bin/env bash
set -euo pipefail
python3 -m pip install -r requirements-dev.txt
npm ci --ignore-scripts --no-audit --no-fund
python3 scripts/build_site.py
python3 -m unittest discover -s tests -v
node --check renderer.mjs
node --check heart-tree.mjs
echo 'Ready: PORT=8080 python3 deploy/server.py'
