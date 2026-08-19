#!/bin/sh
set -eu

: "${DSH_AUTH_PASSWORD:?Set DSH_AUTH_PASSWORD to the initial admin password (used only when the auth database is empty).}"
: "${DSH_AUTH_SECRET:?Set DSH_AUTH_SECRET to a random string of at least 32 characters.}"
: "${DEEPSEEK_API_KEY:?Set DEEPSEEK_API_KEY for the official DeepSeek Harness model provider.}"

export DSH_HOME="${DSH_HOME:-/data}"
export HOME="${HOME:-/home/node}"
export TMPDIR="${TMPDIR:-/tmp}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/npm-cache}"
export npm_config_cache="$NPM_CONFIG_CACHE"
export npm_config_logs_dir="${npm_config_logs_dir:-$NPM_CONFIG_CACHE/_logs}"
export PNPM_STORE_DIR="${PNPM_STORE_DIR:-/tmp/pnpm-store}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/xdg-cache}"

mkdir -p "$DSH_HOME" "$NPM_CONFIG_CACHE" "$npm_config_logs_dir" "$PNPM_STORE_DIR" "$XDG_CACHE_HOME"

# Official dsh refuses to boot unless each overlay is a YAML array (`[]` or
# `- id: …` entries). Online plugin install / agent edits sometimes replace
# this file with a mapping (for example pnpm `allowBuilds`) or truncate it.
# Reset invalid overlays so a persisted /data volume cannot crash-loop.
repair_patch_overlay() {
  overlay=$1
  [ -f "$overlay" ] || return 0
  OVERLAY="$overlay" node --input-type=module <<'EOF'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

const file = process.env.OVERLAY
if (file === undefined || file.length === 0) process.exit(0)
const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
const stripped = text.replace(/^\s*#.*$/gm, '').replace(/^---\s*$/m, '').trim()
const ok = stripped.startsWith('[') || stripped.startsWith('-')
if (ok) process.exit(0)
copyFileSync(file, `${file}.bak`)
writeFileSync(file, [
  '# Reset by dsh-auth-docker: official dsh requires a top-level YAML array.',
  `# Previous contents: ${file}.bak`,
  '[]',
  '',
].join('\n'))
process.stderr.write(`dsh-auth: reset invalid overlay ${file} (backup ${file}.bak)\n`)
EOF
}

# Start as root so an existing root-owned /data volume can be reassigned, then
# drop to PUID:PGID (default: image `node` user 1000:1000). Official sandbox
# children inherit this uid, so workspace files are no longer created as root.
if [ "$(id -u)" = 0 ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  if [ "$PUID" != 0 ]; then
    groupmod -o -g "$PGID" node
    usermod -o -u "$PUID" -g "$PGID" -d /home/node node
    mkdir -p /home/node
    chown "$PUID:$PGID" /home/node
    case "$DSH_HOME" in
      /|/usr|/opt|/etc|/root|/home|/bin|/sbin)
        echo "dsh-auth: refusing to chown $DSH_HOME" >&2
        exit 1
        ;;
    esac
    if [ "${DSH_SKIP_CHOWN:-0}" != 1 ]; then
      chown -R "$PUID:$PGID" "$DSH_HOME"
    fi
    chmod 1777 "$NPM_CONFIG_CACHE" "$PNPM_STORE_DIR" "$XDG_CACHE_HOME" "$TMPDIR" || true
    export USER=node
    export HOME=/home/node
    exec gosu node "$0" "$@"
  fi
fi

# Official dsh is installed from npm. This image then adds the local bundle
# into the `web` profile. Re-running on a persisted volume is idempotent.
dsh plugin --profile web add /opt/dsh-auth

repair_patch_overlay "$DSH_HOME/profiles/web/cordis.patch.yml"
repair_patch_overlay "$DSH_HOME/cordis.patch.yml"

exec dsh --profile web "$@"
