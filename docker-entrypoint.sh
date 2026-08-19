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
export COREPACK_HOME="${COREPACK_HOME:-/usr/local/share/corepack}"
export COREPACK_ENABLE_DOWNLOAD_PROMPT="${COREPACK_ENABLE_DOWNLOAD_PROMPT:-0}"

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

# credentials-local refuses to boot while its document is group- or
# world-readable, whatever uid runs dsh. Tighten it before the plugin tree loads.
tighten_credentials_mode() {
  credentials="$DSH_HOME/.credentials.yaml"
  [ -f "$credentials" ] || return 0
  chmod 600 "$credentials" 2>/dev/null \
    || echo "dsh-auth: cannot chmod 600 $credentials; run it on the NAS host" >&2
}

# Run as root by default: DSH owns the whole /data mount, and root writes
# through the read-only modes pnpm stamps on its content-addressable packages.
# Set PUID (and PGID) to drop privileges instead; the volume is then chowned to
# that uid, which NAS bind mounts may silently remap.
if [ "$(id -u)" = 0 ] && [ "${PUID:-0}" != 0 ]; then
  PGID="${PGID:-$PUID}"
  case "$DSH_HOME" in
    /|/usr|/opt|/etc|/root|/home|/bin|/sbin)
      echo "dsh-auth: refusing to chown $DSH_HOME" >&2
      exit 1
      ;;
  esac
  if [ "$(id -g node)" != "$PGID" ]; then
    groupmod -o -g "$PGID" node
  fi
  if [ "$(id -u node)" != "$PUID" ]; then
    usermod -o -u "$PUID" -g "$PGID" -d /home/node node
  fi
  mkdir -p /home/node
  chown "$PUID:$PGID" /home/node
  if [ "${DSH_SKIP_CHOWN:-0}" != 1 ]; then
    # NAS bind mounts sometimes ignore or remap ownership; never abort boot
    # solely because chown could not rewrite every inode.
    chown -R "$PUID:$PGID" "$DSH_HOME" || true
  fi
  if [ "${DSH_SKIP_CHMOD:-0}" != 1 ]; then
    # pnpm packages are often mode 0444, which only their owner may rewrite.
    chmod -R u+w "$DSH_HOME" || true
  fi
  chmod 1777 "$NPM_CONFIG_CACHE" "$PNPM_STORE_DIR" "$XDG_CACHE_HOME" "$TMPDIR" || true
  tighten_credentials_mode
  export USER=node
  export HOME=/home/node
  exec gosu node "$0" "$@"
fi

tighten_credentials_mode

# Official dsh is installed from npm. This image then adds the local bundle
# into the `web` profile. Re-running on a persisted volume is idempotent.
# Do not crash-loop the public proxy if an already-installed profile tree
# still fails to reconcile — boot dsh so /login stays up.
if ! dsh plugin --profile web add /opt/dsh-auth; then
  echo "dsh-auth: warning: dsh plugin add failed; starting dsh anyway" >&2
fi

repair_patch_overlay "$DSH_HOME/profiles/web/cordis.patch.yml"
repair_patch_overlay "$DSH_HOME/cordis.patch.yml"

# A broken / half-installed profile bundle (EACCES during pnpm) leaves the
# package listed in dsh.profile.bundles but unresolvable — loadProfile then
# aborts. Drop such rows so the auth proxy can still boot; re-add via
# `dsh plugin add` after permissions are fixed.
prune_unresolvable_profile_bundles() {
  PROFILE_DIR="$DSH_HOME/profiles/web" node --input-type=module <<'EOF'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const dir = process.env.PROFILE_DIR
if (dir === undefined || dir.length === 0) process.exit(0)
const manifestPath = join(dir, 'package.json')
if (!existsSync(manifestPath)) process.exit(0)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const bundles = manifest.dsh?.profile?.bundles
if (!Array.isArray(bundles) || bundles.length === 0) process.exit(0)
const requireFromProfile = createRequire(join(dir, 'package.json'))
const kept = []
const dropped = []
for (const name of bundles) {
  if (typeof name !== 'string' || name.length === 0) continue
  try {
    requireFromProfile.resolve(`${name}/package.json`)
    kept.push(name)
  } catch {
    dropped.push(name)
  }
}
if (dropped.length === 0) process.exit(0)
manifest.dsh = manifest.dsh ?? {}
manifest.dsh.profile = manifest.dsh.profile ?? {}
manifest.dsh.profile.bundles = kept
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stderr.write(
  `dsh-auth: dropped unresolvable profile bundles: ${dropped.join(', ')} (re-add with dsh plugin add)\n`,
)
EOF
}

prune_unresolvable_profile_bundles

exec dsh --profile web "$@"
