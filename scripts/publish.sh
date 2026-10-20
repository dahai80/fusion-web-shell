#!/usr/bin/env bash
# Publish the shell SPA dist for gateway same-origin hosting.
# Contract: fusion-gateway #247 (web_shell.spa_dir) + this repo issue #23.
#
# Usage:
#   bash scripts/publish.sh                     # build + publish
#   FUSION_SHELL_SPA_DIR=/some/dir bash scripts/publish.sh   # custom target
#
# Default target ~/.fusion-gateway/shell-spa — pair it in the gateway
# config.yaml:
#   web_shell:
#     spa_dir: /Users/<you>/.fusion-gateway/shell-spa
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${FUSION_SHELL_SPA_DIR:-$HOME/.fusion-gateway/shell-spa}"
DIST="$REPO_ROOT/apps/shell/dist"

log() { echo "[publish] $*"; }
fail() { echo "[publish] FAILED: $*" >&2; exit 1; }

cd "$REPO_ROOT"
log "building @fusion/shell (typecheck + vite build)"
bun run --filter '@fusion/shell' build

[ -f "$DIST/index.html" ] || fail "$DIST/index.html missing after build"

# Gateway serves the dist at the site root ("/" catch-all with index.html
# fallback). Asset refs must be absolute-root (/assets/...); relative refs
# would break SPA deep links after a refresh.
if grep -Eq '(src|href)="\.\.?/' "$DIST/index.html"; then
    fail "index.html contains relative asset paths — set vite base:'/' (issue #23)"
fi
grep -Eq '(src|href)="/assets/' "$DIST/index.html" \
    || fail "index.html has no /assets/ refs — unexpected build output"

# assets/* is immutable-cached gateway-side; keep vite hash naming (default).
ls "$DIST"/assets/*.* >/dev/null 2>&1 \
    || fail "no hashed assets under dist/assets/ — hash naming lost?"

mkdir -p "$TARGET"
rsync -a --delete "$DIST/" "$TARGET/"

log "published: $TARGET"
log "pair gateway config.yaml: web_shell.spa_dir: $TARGET"
