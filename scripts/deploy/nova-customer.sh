#!/bin/bash
# nova-customer.sh — provision or remove a NovaAgent customer tenant.
#
# Usage:
#   nova-customer.sh <name> <root1> [root2...] [--port N]   provision
#   nova-customer.sh --remove <name>                        remove
#
# sudo is required for systemctl. Non-interactive callers may export
# SUDO_PW; otherwise sudo is invoked directly (prompts or cached ticket).
#
# After provisioning:
#   - bake the thin client with remoteUrl http://<server>:8000 and the
#     printed workspaceToken (userData remote-client.json)
#   - create a login user with: nova-adduser.sh <username> <name> <password>
set -e

TENANTS_DIR=/home/moazemi-gc/nova-tenants
CUSTOMERS_FILE=/home/moazemi-gc/.nova-customers.json
UNIT=nova-agent-server@

SUDO=(sudo)
if [ -n "$SUDO_PW" ]; then
  SUDO=(sudo -S)
fi
sudorun() {
  if [ -n "$SUDO_PW" ]; then
    printf '%s\n' "$SUDO_PW" | "${SUDO[@]}" "$@"
  else
    "${SUDO[@]}" "$@"
  fi
}

if [ "${1:-}" = "--remove" ]; then
  NAME="${2:?usage: nova-customer.sh --remove <name>}"
  sudorun systemctl disable --now "$UNIT$NAME" 2>/dev/null || true
  rm -f "$TENANTS_DIR/$NAME.env"
  rm -rf "$TENANTS_DIR/$NAME"
  python3 - "$CUSTOMERS_FILE" "$NAME" <<'EOF'
import json, sys
path, name = sys.argv[1:3]
try:
    data = json.load(open(path))
except Exception:
    data = {"customers": []}
data["customers"] = [c for c in data.get("customers", []) if c.get("name") != name]
json.dump(data, open(path, "w"), indent=2)
EOF
  sudorun systemctl restart nova-gateway
  echo "customer '$NAME' removed"
  exit 0
fi

NAME="${1:?usage: nova-customer.sh <name> <root1> [root2...] [--port N]}"
shift
PORT=""
ROOTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    *) ROOTS+=("$1"); shift ;;
  esac
done
[ ${#ROOTS[@]} -ge 1 ] || { echo "usage: nova-customer.sh <name> <root1> [root2...] [--port N]"; exit 1; }
echo "$NAME" | grep -qE '^[a-zA-Z0-9_-]+$' || { echo "invalid customer name: $NAME"; exit 1; }

if [ -z "$PORT" ]; then
  PORT=18011
  while ss -tln | awk '{print $4}' | grep -q ":$PORT\$"; do PORT=$((PORT+1)); done
fi

TOKEN=$(openssl rand -hex 24)
OH_SECRET=$(openssl rand -hex 32)
# Tenant must share the default cipher or seeded secrets will not
# decrypt in its instance.
DEF_SECRET=$(grep -m1 '^OH_SECRET_KEY=' /home/moazemi-gc/.nova-env | cut -d= -f2-)

# 1. register in the customer registry (ingress reads this per-request)
python3 - "$CUSTOMERS_FILE" "$NAME" "$TOKEN" "$PORT" "${ROOTS[@]}" <<'EOF'
import json, sys
path, name, token, port = sys.argv[1:5]
roots = sys.argv[5:]
try:
    data = json.load(open(path))
except Exception:
    data = {"customers": []}
data["customers"] = [c for c in data.get("customers", []) if c.get("name") != name]
data["customers"].append({"name": name, "token": token, "roots": roots, "port": int(port)})
json.dump(data, open(path, "w"), indent=2)
EOF
chmod 600 "$CUSTOMERS_FILE"

# 2. tenant home + per-instance env
#    NOTE: systemd EnvironmentFile eats one level of backslashes, so
#    Windows-style roots must be written with doubled backslashes.
mkdir -p "$TENANTS_DIR/$NAME/.openhands" "$TENANTS_DIR/$NAME/workspace"
ENVF="$TENANTS_DIR/$NAME.env"
ESC_FIRST=$(printf '%s' "${ROOTS[0]}" | sed 's/\\/\\\\/g')
cat > "$ENVF" <<EOF
HOME=$TENANTS_DIR/$NAME
PORT=$PORT
NOVAAGENT_CUSTOMER_HOME=$ESC_FIRST
NOVAAGENT_LOCAL_TOOLS_URL=http://127.0.0.1:18766/c/$NAME
NOVAAGENT_LOCAL_TOOLS_TOKEN=$TOKEN
SESSION_API_KEY=$TOKEN
NOVAAGENT_TENANT=$NAME
OH_SECRET_KEY=${DEF_SECRET:-$OH_SECRET}
EOF
chmod 600 "$ENVF"

# 2b. seed LLM settings/profiles so the tenant starts with the company
#      LLM active. NOTE the two store locations:
#      - settings.json lives in <tenant>/workspace/.openhands (the
#        conversations_path parent, per persistence/store.py)
#      - profiles/ + agent-profiles/ live in <tenant>/.openhands (HOME)
DEF_STORE=/home/moazemi-gc/workspace/.openhands
DEF_HOME_OH=/home/moazemi-gc/.openhands
mkdir -p "$TENANTS_DIR/$NAME/workspace/.openhands" "$TENANTS_DIR/$NAME/.openhands"
[ -f "$DEF_STORE/settings.json" ] && cp "$DEF_STORE/settings.json" "$TENANTS_DIR/$NAME/workspace/.openhands/"
[ -d "$DEF_HOME_OH/profiles" ] && cp -r "$DEF_HOME_OH/profiles" "$TENANTS_DIR/$NAME/.openhands/"
[ -d "$DEF_HOME_OH/agent-profiles" ] && cp -r "$DEF_HOME_OH/agent-profiles" "$TENANTS_DIR/$NAME/.openhands/"
find "$TENANTS_DIR/$NAME" -name '.*.lock' -delete 2>/dev/null || true
chmod 600 "$TENANTS_DIR/$NAME/workspace/.openhands/settings.json" \
          "$TENANTS_DIR/$NAME/.openhands/profiles/"*.json \
          "$TENANTS_DIR/$NAME/.openhands/agent-profiles/"*.json 2>/dev/null || true

# 3. start the per-tenant agent-server and refresh gateway customer list
sudorun systemctl enable --now "$UNIT$NAME"
sudorun systemctl restart nova-gateway
sleep 8

# 4. verify
echo "== status =="
systemctl is-active "$UNIT$NAME" nova-gateway
echo -n "API with tenant token (expect 200): "
curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 -H "X-Session-API-Key: $TOKEN" "http://127.0.0.1:$PORT/api/conversations/search?limit=1"
echo -n "API without token (expect 401): "
curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 "http://127.0.0.1:$PORT/api/conversations/search?limit=1"

echo
echo "customer '$NAME' provisioned:"
echo "  token: $TOKEN"
echo "  port:  $PORT"
echo "  roots: ${ROOTS[*]}"
echo "  bake:  remoteUrl http://<server>:8000 + workspaceToken above (userData remote-client.json)"
echo "  user:  nova-adduser.sh <username> $NAME <password>"
