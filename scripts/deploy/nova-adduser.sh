#!/bin/bash
# NovaAgent user management: nova-adduser.sh <username> <customer> [password]
set -e
USER_NAME="${1:?usage: nova-adduser.sh <username> <customer> [password]}"
CUSTOMER="${2:-default}"
PASS="${3:-}"
if [ -z "$PASS" ]; then
  read -s -p "password for $USER_NAME: " PASS; echo
fi
SALT=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')
HASH=$(python3 -c "import hashlib,sys; print(hashlib.sha256((sys.argv[1]+':'+sys.argv[2]).encode()).hexdigest())" "$SALT" "$PASS")
F=/home/moazemi-gc/.nova-users.json
python3 - "$F" "$USER_NAME" "$CUSTOMER" "$SALT" "$HASH" <<'EOF'
import json, sys
path, username, customer, salt, h = sys.argv[1:6]
try:
    data = json.load(open(path))
except Exception:
    data = {"users": []}
users = [u for u in data.get("users", []) if u.get("username") != username]
users.append({"username": username, "customer": customer, "salt": salt, "hash": h})
data["users"] = users
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print(f"user '{username}' -> customer '{customer}' saved to {path}")
EOF
chmod 600 "$F"
