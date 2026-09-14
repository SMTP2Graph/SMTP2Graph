#!/usr/bin/env bash
set -euo pipefail

npm ci
npm run build
npm run test:receive -- --logging error
node test/ci/workflow-policy.cjs
