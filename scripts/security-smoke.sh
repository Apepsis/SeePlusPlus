#!/usr/bin/env bash
set -euo pipefail
docker build -f runner/local/Dockerfile -t seeplusplus-runner:local .
node scripts/security-smoke.mjs
