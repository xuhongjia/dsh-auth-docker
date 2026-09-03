FROM node:22.19-bookworm-slim

# Shared Corepack store so the dropped-privilege `node` user can run `pnpm`
# without a TTY prompt. Profiles often pin pnpm@11 via packageManager.
ENV COREPACK_HOME=/usr/local/share/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git gosu \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p "$COREPACK_HOME" \
  && corepack enable \
  && corepack prepare pnpm@10.14.0 --activate \
  && corepack prepare pnpm@11.22.0 \
  && chmod -R a+rwX "$COREPACK_HOME"

# Official Harness, not a fork. npm `latest` is still 0.1.1-rc.2; pin the
# published alpha CLI. Override at build time with --build-arg DSH_VERSION=…
ARG DSH_VERSION=0.1.2-alpha.4
RUN npm install -g "@deepseek-ai/dsh@${DSH_VERSION}"

WORKDIR /opt
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY plugins ./plugins
RUN pnpm install \
  && pnpm -r build \
  && pnpm prune --prod --ignore-scripts

COPY docker-entrypoint.sh docker-profile-bundles.mjs docker-dsh-settings-compat.mjs docker-session-projcache.mjs /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && node /usr/local/bin/docker-dsh-settings-compat.mjs /usr/local/lib/node_modules \
  && mkdir -p /home/node \
  && chown -R node:node /home/node /opt

# Official sandbox (bwrap/Landlock) mounts / read-only and only writes
# workspace + /tmp. Agent npm/xdg caches stay on /tmp. The pnpm store for
# `dsh plugin add` lives on /data so NAS/container recreates keep marketplace
# plugins (a /tmp store is wiped and then looks like an unresolvable bundle).
ENV DSH_HOME=/data \
    PORT=3080 \
    DSH_AUTH_BASE_URL=http://127.0.0.1:3080 \
    HOME=/home/node \
    USER=node \
    TMPDIR=/tmp \
    NPM_CONFIG_CACHE=/tmp/npm-cache \
    npm_config_cache=/tmp/npm-cache \
    npm_config_logs_dir=/tmp/npm-cache/_logs \
    npm_config_update_notifier=false \
    PNPM_STORE_DIR=/data/pnpm-store \
    XDG_CACHE_HOME=/tmp/xdg-cache \
    COREPACK_HOME=/usr/local/share/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

VOLUME ["/data"]
EXPOSE 3080

ENTRYPOINT ["docker-entrypoint.sh"]
