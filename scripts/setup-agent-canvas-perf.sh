#!/usr/bin/env bash
# One-shot host setup for NovaAgent performance on large workspaces.
# Applies a global git excludesfile and speeds up git status on named repos.
set -euo pipefail

IGNORE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/git"
IGNORE_FILE="${OH_GLOBAL_GITIGNORE:-$IGNORE_DIR/ignore}"

mkdir -p "$(dirname "$IGNORE_FILE")"

cat > "$IGNORE_FILE" << 'EOF'
# Global gitignore for NovaAgent / local dev
# Keeps git status / Changes panel fast on large workspaces
node_modules/
dist/
build/
.vite/
.next/
.cache/
.turbo/
.parcel-cache/
target/
__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/
.venv/
venv/
*.log
.DS_Store
.env
.env.*
!.env.example
coverage/
# Common model / weight dumps
*.safetensors
*.gguf
*.bin
*.pt
*.pth
*.onnx
EOF

git config --global core.excludesfile "$IGNORE_FILE"
echo "Set core.excludesfile => $(git config --global --get core.excludesfile)"

for repo in "$@"; do
  if [ -d "$repo/.git" ]; then
    git -C "$repo" config core.untrackedCache true
    git -C "$repo" config core.fsmonitor true
    echo "Configured untrackedCache+fsmonitor: $repo"
  else
    echo "Skip (no .git): $repo" >&2
  fi
done

echo "Done. Prefer project-scoped workspaces; never open home/ or model dump roots."
