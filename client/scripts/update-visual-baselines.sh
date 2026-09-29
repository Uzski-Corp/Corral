#!/usr/bin/env bash
# Regenerate the Playwright visual baselines (e2e/__screenshots__) on the CI renderer, not a laptop's Chromium.
# Baselines are platform-specific; visual.spec.ts only runs them when CI is set (ENG-89).
#
#   pnpm test:e2e:update            # from client/, needs Docker
#
# It runs the official Playwright image pinned to the repo's @playwright/test version, builds the app and updates
# only the visual snapshots. Review the diff, then commit e2e/__screenshots__. Once ENG-89 adds e2e to CI, run the
# same command in that job (or a workflow_dispatch job) so the baselines come from the image CI compares against.
set -euo pipefail
cd "$(dirname "$0")/.."
PW_VERSION="$(node -p 'require("./node_modules/@playwright/test/package.json").version')"
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"
REPO="$(git rev-parse --show-toplevel)"
exec docker run --rm --ipc=host -e CI=1 -e NEXT_TELEMETRY_DISABLED=1 -v "$REPO:/work" -w /work/client "$IMAGE" bash -lc '
  corepack enable && pnpm install --frozen-lockfile && pnpm build &&
  pnpm exec playwright test e2e/visual.spec.ts --project=app --update-snapshots'
