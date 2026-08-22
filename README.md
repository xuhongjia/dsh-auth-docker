# dsh-auth

English | [中文](README.zh.md)

Better Auth login for official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). This repository is **not a fork**. Docker installs `@deepseek-ai/dsh` from npm, then `dsh plugin --profile web add` every bundle under `plugins/`.

The official Web server rejects `--host 0.0.0.0` and has no auth middleware. This plugin binds `0.0.0.0:3080`, serves `/login` and `/auth`, and proxies authenticated HTTP plus WebSocket traffic to the official webserver on `127.0.0.1`. Account passwords never enter DSH model RPC.

## Run with Docker

```sh
cp .env.example .env
# set DSH_AUTH_PASSWORD, DSH_AUTH_SECRET (>= 32 chars); DEEPSEEK_API_KEY is optional
docker compose up --build
```

Open `http://localhost:3080`. The first boot creates `admin` from `DSH_AUTH_PASSWORD`. Later boots reuse `/data/auth/auth.sqlite` and ignore that password.

Behind HTTPS (Caddy, nginx, Cloudflare), set `DSH_AUTH_BASE_URL` to that origin and `DSH_AUTH_SECURE_COOKIES=1`.

## Pull the published image

Pushes to `main` build and publish `linux/amd64` and `linux/arm64` images to GitHub Container Registry:

```text
ghcr.io/xuhongjia/dsh-auth-docker:0.0.17
ghcr.io/xuhongjia/dsh-auth-docker:latest
```

After the first successful workflow run, set the package visibility to Public under GitHub → Packages. Then:

```sh
docker pull ghcr.io/xuhongjia/dsh-auth-docker:0.0.17
# or, with the same .env as above:
docker compose pull
docker compose up -d
```

## Install into an existing official dsh

```sh
npm install -g @deepseek-ai/dsh
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

## Layout

```
plugins/dsh-auth           Cordis bundle: Better Auth + reverse proxy
plugins/dsh-cursor-plugin  Loopback Cursor SDK OpenAI gateway (Settings → Models)
Dockerfile                 npm i -g @deepseek-ai/dsh, then dsh plugin add each plugins/* folder
```

See [plugins/README.md](plugins/README.md) and [plugins/dsh-cursor-plugin/README.md](plugins/dsh-cursor-plugin/README.md). Existing `$DSH_HOME/settings.yaml` `llm-pi-ai.providers` (for example `opencode-go`) merge per provider with the Cursor route.

## Known limitations

- **No account-settings tab yet** — the Host login page is the shipped browser surface; username/password changes can be added later as a `dsh.client` contribution.
- **One initial account** — public sign-up is disabled; the first administrator is seeded once.
- **Official Harness stays loopback-only** — this proxy is the network face. Do not publish the internal webserver port.
- **Public-origin pairing heartbeat** — marketplace `dsh-remote-web-ui` treats `https://…` as LAN and `POST /api/pair/heartbeat` 401s `unpaired` when the browser has no `dsh_pair` cookie. A signed-in Better Auth session rewrites that unpaired body to `{"ok":true}`. A live pairing cookie still reaches upstream so phone/desktop presence stays accurate. QR pairing is unchanged.
- **Public-origin `/remote` channel** — the same plugin rewrites desktop `/api` to `/remote/api` and shows “This device is not paired” without a pairing cookie. After Better Auth login, this proxy strips `/remote` and forwards `/api` (and `/sidebar`, `/git`, `/pet`) as loopback, so the public desktop does not need a second device-pair. Phone `/m/` QR pairing is unchanged.
- **Plugin same-origin loopback** — after login, the proxy rewrites `Host` and `Origin` to `http://127.0.0.1:<internal>` and strips forwarding headers (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, …). Plugin Market update/restart and other plugins that require Origin to match Host then see a local same-origin call. Better Auth remains the public gate. In Docker, a successful Market restart still replaces the `dsh` process; if that process is PID 1 the container exits.

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

Official DSH sandbox (bwrap / Landlock) mounts `/` read-only and only writes the session workspace and `/tmp`. npm/pnpm caches therefore point at `/tmp`, not `/root/.npm`. Recreate with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` (compose already sets this) if logs stop at Corepack's Yes/No download prompt.

`credentials-local` refuses to boot when `$DSH_HOME/.credentials.yaml` is group- or world-readable. The entrypoint sets that file to mode `600` on every boot. If a host chmod made it `666`, fix it on the host as well:

```sh
chmod 600 /path/to/dsh-data/.credentials.yaml
```

Unresolvable rows in `dsh.profile.bundles` (half-installed plugins) are dropped on boot so `/login` can still come up; re-add them with `dsh plugin add`.
