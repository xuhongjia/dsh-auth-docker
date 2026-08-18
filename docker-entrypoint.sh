#!/bin/sh
set -eu

: "${DSH_AUTH_PASSWORD:?Set DSH_AUTH_PASSWORD to the initial admin password (used only when the auth database is empty).}"
: "${DSH_AUTH_SECRET:?Set DSH_AUTH_SECRET to a random string of at least 32 characters.}"
: "${DEEPSEEK_API_KEY:?Set DEEPSEEK_API_KEY for the official DeepSeek Harness model provider.}"

export DSH_HOME="${DSH_HOME:-/data}"
mkdir -p "$DSH_HOME"

# Official dsh is installed from npm. This image then adds the local bundle
# into the `web` profile. Re-running on a persisted volume is idempotent.
dsh plugin --profile web add /opt/dsh-auth

exec dsh --profile web "$@"
