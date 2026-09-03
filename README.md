# dsh-auth

English | [中文](README.zh.md)

Better Auth login for official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). This repository is **not a fork**. Docker installs `@deepseek-ai/dsh@0.1.2-alpha.4` from npm (`alpha`; `latest` is still `0.1.1-rc.2`), then `dsh plugin --profile web add` every bundle under `plugins/`. Override the CLI with `--build-arg DSH_VERSION=…` or compose `DSH_VERSION`.

The official Web server rejects `--host 0.0.0.0` and has no auth middleware. This plugin binds `0.0.0.0:3080`, serves `/login` and `/auth`, and proxies authenticated HTTP plus WebSocket traffic to the official webserver on `127.0.0.1`. Account passwords never enter DSH model RPC.

## Run with Docker

```sh
cp .env.example .env
# set DSH_AUTH_PASSWORD, DSH_AUTH_SECRET (>= 32 chars); DEEPSEEK_API_KEY is optional
docker compose up --build
```

Open `http://localhost:3080`. The first boot creates `admin` from `DSH_AUTH_PASSWORD`. Later boots reuse `/data/auth/auth.sqlite` and ignore that password.

Behind HTTPS (Caddy, nginx, Cloudflare, 极空间 reverse proxy), set `DSH_AUTH_BASE_URL` to that origin and `DSH_AUTH_SECURE_COOKIES=1`.

## 极空间 / NAS

Keep `PUID=0` (root) when `/data` is a NAS bind mount so `dsh plugin add` can rewrite pnpm's `0444` files. Map one persistent folder to `/data` (auth sqlite, settings, marketplace plugins, pnpm store). Do not map only `/tmp`.

Set the public origin the browser actually uses:

```
DSH_AUTH_BASE_URL=https://dsh.example.com
DSH_AUTH_SECURE_COOKIES=1
```

OpenViking Memory is a separate process. Inside this container, `http://127.0.0.1:1933` is not the NAS host. Point the plugin at the NAS LAN IP, `host-gateway`, or run OpenViking on the same Docker network.

Plugin Market “restart” replaces PID 1 and the container exits; `restart: unless-stopped` brings it back. Re-add a dropped marketplace plugin after the share is healthy:

```sh
docker compose exec dsh dsh plugin --profile web add @openviking/dsh-memory-plugin
```

Settings → Models on the public hostname is official DSH loopback-only. On the NAS you can still put keys in the persisted `/data/.credentials.yaml` (mode `600`) and provider routes in `/data/settings.yaml`.

## Pull the published image

Pushes to `main` build and publish `linux/amd64` and `linux/arm64` images to GitHub Container Registry:

```text
ghcr.io/xuhongjia/dsh-auth-docker:0.0.22
ghcr.io/xuhongjia/dsh-auth-docker:latest
```

After the first successful workflow run, set the package visibility to Public under GitHub → Packages. Then:

```sh
docker pull ghcr.io/xuhongjia/dsh-auth-docker:0.0.22
# or, with the same .env as above:
docker compose pull
docker compose up -d
```

## Install into an existing official dsh

```sh
npm install -g @deepseek-ai/dsh@0.1.2-alpha.4
pnpm install && pnpm build
export DSH_AUTH_PASSWORD='...'
export DSH_AUTH_SECRET='...'   # >= 32 characters
dsh plugin --profile web add ./plugins/dsh-auth
dsh plugin --profile web add ./plugins/dsh-cursor-plugin
dsh --profile web
```

The public URL is printed as `dsh-auth: public http://0.0.0.0:3080 → 127.0.0.1:<internal>`.

## Environment

| Variable | Meaning |
|---|---|
| `DEEPSEEK_API_KEY` | Optional official DeepSeek Models key. Cursor can be configured in Settings → Models instead |
| `DSH_AUTH_PASSWORD` | Initial admin password; read only when the auth database has no users |
| `DSH_AUTH_SECRET` | Better Auth signing secret, at least 32 characters |
| `DSH_AUTH_BASE_URL` | Public origin, for example `http://localhost:3080` or `https://dsh.example.com` |
| `DSH_AUTH_TRUSTED_ORIGINS` | Extra comma-separated origins Better Auth accepts |
| `DSH_AUTH_SECURE_COOKIES` | Set `1` when the public origin is HTTPS |
| `PORT` | Public listen port, default `3080` |
| `DSH_HOME` | Harness home (auth sqlite, sessions, settings). Docker uses `/data` |
| `PUID` / `PGID` | Runtime uid/gid inside the container, default `0` (root). Set `1000` or your host user to chown `/data` and drop privileges instead |
| `DSH_SKIP_CHOWN` | Set `1` to skip the `/data` chown when dropping privileges |
| `DSH_VERSION` | Build-arg for the official CLI; default `0.1.2-alpha.4`. `docker compose build` / `--build-arg DSH_VERSION=` |

## Layout

```
plugins/dsh-auth           Cordis bundle: Better Auth + reverse proxy
plugins/dsh-cursor-plugin  Loopback Cursor SDK OpenAI gateway (Settings → Models)
Dockerfile                 npm i -g @deepseek-ai/dsh@0.1.2-alpha.4, then dsh plugin add each plugins/* folder
```

See [plugins/README.md](plugins/README.md) and [plugins/dsh-cursor-plugin/README.md](plugins/dsh-cursor-plugin/README.md). Existing `$DSH_HOME/settings.yaml` `llm-pi-ai.providers` (for example `opencode-go`) merge per provider with the Cursor route.

## Known limitations

- **No account-settings tab yet** — the Host login page is the shipped browser surface; username/password changes can be added later as a `dsh.client` contribution.
- **One initial account** — public sign-up is disabled; the first administrator is seeded once.
- **Official Harness stays loopback-only** — this proxy is the network face. Do not publish the internal webserver port.
- **Public-origin pairing heartbeat** — marketplace `dsh-remote-web-ui` treats `https://…` as LAN and `POST /api/pair/heartbeat` 401s `unpaired` when the browser has no `dsh_pair` cookie. A signed-in Better Auth session rewrites that unpaired body to `{"ok":true}`. A live pairing cookie still reaches upstream so phone/desktop presence stays accurate. QR pairing is unchanged.
- **Public-origin `/remote` channel** — the same plugin rewrites desktop `/api` to `/remote/api` and shows “This device is not paired” without a pairing cookie. After Better Auth login, this proxy strips `/remote` and forwards `/api` (and `/sidebar`, `/git`, `/pet`) as loopback, so the public desktop does not need a second device-pair. Phone `/m/` QR pairing is unchanged.
- **Plugin same-origin loopback** — after login, the proxy rewrites `Host` and `Origin` to `http://127.0.0.1:<internal>` and strips forwarding headers (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, …). Plugin Market update/restart and other plugins that require Origin to match Host then see a local same-origin call. Better Auth remains the public gate. In Docker, a successful Market restart still replaces the `dsh` process; if that process is PID 1 the container exits.
- **No in-container browser** — `dsh web` would otherwise try to open the host default browser. The image sets `openBrowser: false` and passes `--no-open`.
- **SQLite ExperimentalWarning** — Better Auth uses Node's built-in `node:sqlite`. The warning is from Node, not a failed boot.
- **Marketplace plugins vs dsh 0.1.2** — `@deepseek-ai/dsh-settings` 0.1.2 removed `installSettingsSection` and `settingsNamespace`. Older `dshmarket`, `dsh-better-sidebar`, `@linxin666/dsh-web-ui-all@0.3.6`, and `@linxin666/dsh-doctor` then fail to import (`does not provide an export named …`). This image puts those two helpers back on every `dsh-settings` copy at build and boot. Prefer migrating `@linxin666/dsh-web-ui-all` to `@linxin666/dsh-web-all` (0.3.12+) when you can; `dshmarket@1.40.0` already inlined the helpers.
- **Old `dsh-remote-web-ui` vs missing `dsh-host-apiproxy`** — `@linxin666/dsh-remote-web-ui@0.3.6` (and deprecated `@linxin666/dsh-web-ui-all` that nests it) still imports `@deepseek-ai/dsh-host-apiproxy`, which 0.1.2 no longer ships. That `ERR_MODULE_NOT_FOUND` is included in the same fatal Include `AggregateError`. Boot drops those profile layers until you `dsh plugin add @linxin666/dsh-web-all` (ships `dsh-remote-web-ui@0.3.12`, which does not import it). Pairing then needs the new pack.
- **Session projection cache after 0.1.2** — upgrading a persisted `/data` can abort with `domain 'session_projcache' … identity.isSeeded` / `inheritedEventCount`. The cache is derived; `$DSH_HOME/sessions/*.jsonl` is the chat log. This image renames stale `storages/session_projcache.json` and `storages/session_projcache/` to `.bak-dsh-auth-*` on boot. Do not delete `/data/sessions` or `storages/workspace.json` (workspace registry). On an older image, move those two cache paths aside and recreate the container. See [upstream discussion](https://github.com/deepseek-ai/deepseek-harness/discussions/5396).

## Broken `cordis.patch.yml` after plugin install

Official `dsh` boots only when `$DSH_HOME/profiles/web/cordis.patch.yml` is a **YAML array** (`[]` or `- id:` entries). If an online install or agent edit writes a mapping (or empties the file), boot fails with `must be a top-level YAML array`. Auth data in `/data/auth` is unrelated — reset the overlay, not the whole volume:

```sh
docker compose stop
docker run --rm -v dsh-auth-docker_dsh-data:/data busybox \
  sh -c 'cp /data/profiles/web/cordis.patch.yml /data/profiles/web/cordis.patch.yml.bak 2>/dev/null; printf "[]\n" > /data/profiles/web/cordis.patch.yml'
docker compose up -d
```

Replace `dsh-auth-docker_dsh-data` with your compose volume name (`docker volume ls | grep dsh`). Current images that include this entrypoint reset an invalid overlay automatically and keep a `.bak`.

## Runtime user, sandbox npm cache, and credentials mode

The container runs as **root** by default (`PUID=0`). That matches a single bind-mounted `/data` directory (for example a NAS share): root can rewrite pnpm's `0444` packages, so `dsh plugin add` no longer fails with EACCES. Set `PUID`/`PGID` only when you want to drop privileges; the entrypoint then chowns `/data` and `gosu`s to that user.

Official DSH sandbox (bwrap / Landlock) mounts `/` read-only and only writes the session workspace and `/tmp`. Agent npm/xdg caches stay on `/tmp`. The pnpm store for `dsh plugin add` is `/data/pnpm-store` so a NAS container recreate does not turn marketplace plugins into unresolvable bundles. Recreate with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` (compose already sets this) if logs stop at Corepack's Yes/No download prompt.

`credentials-local` refuses to boot when `$DSH_HOME/.credentials.yaml` is group- or world-readable. The entrypoint sets that file to mode `600` on every boot. If a host chmod made it `666`, fix it on the host as well:

```sh
chmod 600 /path/to/dsh-data/.credentials.yaml
```

Unresolvable rows in `dsh.profile.bundles` (files gone after a container recreate) are re-added with `dsh plugin add` on boot. Resolution matches official DSH: a directory that contains `package.json`, not `require.resolve(name/package.json)`. Packages that omit `./package.json` from `"exports"` (including `@openviking/dsh-memory-plugin`) stay installed. A previous boot that stripped such a row while the files were still on disk is restored from `dependencies`. Whatever still cannot resolve is dropped so `/login` can come up. Layers that still import missing `@deepseek-ai/dsh-host-apiproxy` are dropped the same way.

Official DSH may log `fatal: not a git repository` and `GIT_DISCOVERY_ACROSS_FILESYSTEM` when the session workspace is a Docker/NAS volume that is not a git checkout. That does not stop Web. Open a cloned repo if you want git status.

If a plugin is genuinely missing after the host has network:

```sh
docker compose exec dsh dsh plugin --profile web add @openviking/dsh-memory-plugin
docker compose exec dsh dsh plugin --profile web add @linxin666/dsh-web-all
```
