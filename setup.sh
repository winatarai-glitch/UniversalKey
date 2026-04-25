#!/usr/bin/env bash
# UniversalKey — first-run setup
# Bootstraps your environment, prompts for VAULT_PATH and ACTIVE_PACK,
# and runs `extract-from-source.mjs scaffold` to populate the vault.
set -euo pipefail

UK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$UK_ROOT/.env"
ENV_EXAMPLE="$UK_ROOT/.env.example"

# ── platform detection ────────────────────────────────────────────
OS="unknown"
case "$(uname -s)" in
  Darwin)  OS="mac" ;;
  Linux)   OS="linux" ;;
  MSYS*|MINGW*|CYGWIN*) OS="windows" ;;
esac
echo "Detected platform: $OS"

# ── dependency check ──────────────────────────────────────────────
check_required() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: '$1' is required but not found on PATH." >&2
    exit 1
  fi
}
check_optional() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "WARNING: optional dependency '$1' missing — $2"
  fi
}
check_required node
check_required git
node_major=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$node_major" -lt 18 ]; then
  echo "ERROR: node >= 18 required (found $node_major)." >&2
  exit 1
fi
check_optional pandoc    "DOCX/RTF conversion will be skipped."
check_optional tesseract "Scanned-PDF OCR will be skipped."
check_optional soffice   "Legacy .ppt/.odt conversion will be skipped."

# ── .env bootstrap ────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ] && [ -f "$ENV_EXAMPLE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created .env from .env.example"
fi

# ── prompt: VAULT_PATH ────────────────────────────────────────────
case "$OS" in
  windows) DEFAULT_VAULT="${USERPROFILE:-$HOME}/Documents/UniversalKey-Vault" ;;
  *)       DEFAULT_VAULT="$HOME/Documents/UniversalKey-Vault" ;;
esac
read -rp "Vault path [${DEFAULT_VAULT}]: " VAULT_PATH
VAULT_PATH="${VAULT_PATH:-$DEFAULT_VAULT}"

# ── prompt: ACTIVE_PACK ───────────────────────────────────────────
PACK_DIR="$UK_ROOT/_meta/domain-packs"
echo ""
echo "Available domain packs:"
if [ -d "$PACK_DIR" ]; then
  for f in "$PACK_DIR"/*.md; do
    [ -f "$f" ] || continue
    name=$(basename "$f" .md)
    if [ "$name" != "_template" ] && [ "$name" != "README" ]; then
      echo "  - $name"
    fi
  done
fi
read -rp "Active pack [chiropractic]: " ACTIVE_PACK
ACTIVE_PACK="${ACTIVE_PACK:-chiropractic}"

# ── idempotent .env update ────────────────────────────────────────
update_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # macOS BSD sed needs -i '' ; GNU sed accepts -i alone.
    # Using -i.bak then cleaning up is portable across both.
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}
update_env "VAULT_PATH" "$VAULT_PATH"
update_env "ACTIVE_PACK" "$ACTIVE_PACK"

# ── scaffold vault ────────────────────────────────────────────────
echo ""
echo "Scaffolding vault at: $VAULT_PATH"
node "$UK_ROOT/tools/extract-from-source.mjs" scaffold

# ── next steps ────────────────────────────────────────────────────
cat <<EOF

Setup complete.

Next steps:
  1. Open Obsidian -> 'Open folder as vault' -> $VAULT_PATH
  2. To switch packs: edit .env (ACTIVE_PACK=) and re-run:
       node tools/extract-from-source.mjs scaffold
  3. To sync external content: see tools/extract-from-source.mjs sync
  4. To anonymize content before commit: see tools/anonymize.mjs

EOF
