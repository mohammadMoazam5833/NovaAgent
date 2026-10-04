#!/bin/bash
# NovaAgent — import config/secrets on the NEW server.
# Run AFTER: git clone + node/python setup + frontend build (see scripts/deploy/README-MIGRATE.md)
set -e
ARCH="$1"
if [ ! -f "$ARCH" ]; then
  echo "usage: bash scripts/deploy/migrate-import.sh <path/to/nova-migrate-*.tar.gz>"
  exit 1
fi
tar -xzf "$ARCH" -C "$HOME"
chmod 600 "$HOME/.nova-admin-env" "$HOME/.nova-env" 2>/dev/null || true

echo "== systemd units =="
sudo cp scripts/deploy/*.service /etc/systemd/system/ 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl enable --now nova-ingress nova-gateway nova-automation nova-admin 2>/dev/null || true
sleep 2
systemctl is-active nova-ingress && systemctl is-active nova-gateway && systemctl is-active nova-automation && systemctl is-active nova-admin

echo "== firewall =="
sudo ufw allow 22/tcp 2>/dev/null || true
sudo ufw allow 8000/tcp 2>/dev/null || true
sudo ufw allow 8002/tcp 2>/dev/null || true

echo ""
echo "=== config restored ==="
echo "next steps:"
echo "  1) copy tenant data (rsync) — see README-MIGRATE.md step 5"
echo "  2) python SDK env: uv sync (repo root)"
echo "  3) verify: http://<new-ip>:8000/  |  /admin  |  /download"
