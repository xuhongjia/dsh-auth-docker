FROM node:22.19-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.14.0 --activate

# Official Harness, not a fork. Pin the published CLI.
ARG DSH_VERSION=0.1.0-rc.7
RUN npm install -g "@deepseek-ai/dsh@${DSH_VERSION}"

WORKDIR /opt/dsh-auth
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json cordis.patch.yml ./
COPY src ./src
RUN pnpm install \
  && pnpm build \
  && pnpm prune --prod --ignore-scripts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV DSH_HOME=/data \
    PORT=3080 \
    DSH_AUTH_BASE_URL=http://127.0.0.1:3080

VOLUME ["/data"]
EXPOSE 3080

ENTRYPOINT ["docker-entrypoint.sh"]
