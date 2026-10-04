#!/bin/bash
# NovaAgent — export config/secrets from the OLD server (small archive, no user data)
set -e
STAMP=$(date +%Y%m%d-%H%M)
OUT="$HOME/nova-migrate-$STAMP.tar.gz"
cd "$HOME"
tar -czf "$OUT" \
  .nova-env \
  .nova-customers.json \
  .nova-admin-env \
  .local/share/opencode/auth.json \
  nova-ingress.mjs \
  nova-admin.mjs \
  $(ls -d nova-tenants 2>/dev/null || true) \
  2>/dev/null
echo "=== export ready: $OUT ==="
echo "included: tenant registry + env files + admin credentials + LLM key + current ingress/admin + tenant envs"
echo ""
echo "IMPORTANT — user data (conversations/workspaces) is NOT included."
echo "Copy it separately with rsync, per tenant HOME (see scripts/deploy/README-MIGRATE.md):"
echo "  default tenant HOME: /home/moazemi-gc  (workspace/ + .openhands/)"
echo "  other tenants HOME:  /home/moazemi-gc/nova-tenants/<name>/"
echo "  download site:       /home/moazemi-gc/downloads/  (index.html + artifacts — or rebuild)"
