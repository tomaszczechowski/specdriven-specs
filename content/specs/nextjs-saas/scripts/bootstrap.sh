#!/usr/bin/env bash
# One-shot local setup for the nextjs-saas spec.
# Assumes you've already copied env.example to .env.local and filled the values.

set -euo pipefail

echo "→ Installing dependencies"
pnpm install

echo "→ Applying database schema and RLS policies"
pnpm db:migrate

echo "→ Seeding a demo tenant + user (skip with SKIP_SEED=1)"
if [ "${SKIP_SEED:-0}" != "1" ]; then
  pnpm db:seed
fi

echo "→ Done. Run \`pnpm dev\` to start, and \`stripe listen --forward-to localhost:3000/api/webhooks/stripe\` in another terminal for billing."
