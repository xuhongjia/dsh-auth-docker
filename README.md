# dsh-auth

English | [中文](README.zh.md)

Better Auth login for official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). This repository is **not a fork**. Docker installs `@deepseek-ai/dsh` from npm, then `dsh plugin --profile web add` this bundle.

The official Web server rejects `--host 0.0.0.0` and has no auth middleware. This plugin binds `0.0.0.0:3080`, serves `/login` and `/auth`, and proxies authenticated HTTP plus WebSocket traffic to the official webserver on `127.0.0.1`. Account passwords never enter DSH model RPC.

## Run with Docker

```sh
cp .env.example .env
# set DEEPSEEK_API_KEY, DSH_AUTH_PASSWORD, DSH_AUTH_SECRET (>= 32 chars)
docker compose up --build
```

Open `http://localhost:3080`. The first boot creates `admin` from `DSH_AUTH_PASSWORD`. Later boots reuse `/data/auth/auth.sqlite` and ignore that password.

Behind HTTPS (Caddy, nginx, Cloudflare), set `DSH_AUTH_BASE_URL` to that origin and `DSH_AUTH_SECURE_COOKIES=1`.

## Pull the published image

Pushes to `main` build and publish `linux/amd64` and `linux/arm64` images to GitHub Container Registry:

```text
ghcr.io/xuhongjia/dsh-auth-docker:0.0.7
ghcr.io/xuhongjia/dsh-auth-docker:latest
```

After the first successful workflow run, set the package visibility to Public under GitHub → Packages. Then:

```sh
docker pull ghcr.io/xuhongjia/dsh-auth-docker:0.0.7
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
dsh plugin --profile web add .
dsh --profile web
```

The public URL is printed as `dsh-auth: public http://0.0.0.0:3080 → 127.0.0.1:<internal>`.

## Environment

| Variable | Meaning |
|---|---|
| `DEEPSEEK_API_KEY` | Official Harness model key |
| `DSH_AUTH_PASSWORD` | Initial admin password; read only when the auth database has no users |
| `DSH_AUTH_SECRET` | Better Auth signing secret, at least 32 characters |
| `DSH_AUTH_BASE_URL` | Public origin, for example `http://localhost:3080` or `https://dsh.example.com` |
| `DSH_AUTH_TRUSTED_ORIGINS` | Extra comma-separated origins Better Auth accepts |
| `DSH_AUTH_SECURE_COOKIES` | Set `1` when the public origin is HTTPS |
| `PORT` | Public listen port, default `3080` |
| `DSH_HOME` | Harness home (auth sqlite, sessions, settings). Docker uses `/data` |
| `PUID` / `PGID` | Runtime uid/gid inside the container, default `1000` (`node`). Entrypoint starts as root, chowns `/data`, then drops privileges. Set these to your host user if you bind-mount a workspace |
| `DSH_SKIP_CHOWN` | Set `1` to skip the `/data` chown on boot |

## Layout

```
src/           Cordis bundle: Better Auth + reverse proxy
cordis.patch.yml   Forces official webserver onto 127.0.0.1:0 and inserts this plugin
Dockerfile     npm i -g @deepseek-ai/dsh, then dsh plugin add this package
```

## Known limitations

- **No account-settings tab yet** — the Host login page is the shipped browser surface; username/password changes can be added later as a `dsh.client` contribution.
- **One initial account** — public sign-up is disabled; the first administrator is seeded once.
- **Official Harness stays loopback-only** — this proxy is the network face. Do not publish the internal webserver port.

## Broken `cordis.patch.yml` after plugin install

Official `dsh` boots only when `$DSH_HOME/profiles/web/cordis.patch.yml` is a **YAML array** (`[]` or `- id:` entries). If an online install or agent edit writes a mapping (or empties the file), boot fails with `must be a top-level YAML array`. Auth data in `/data/auth` is unrelated — reset the overlay, not the whole volume:

```sh
docker compose stop
docker run --rm -v dsh-auth-docker_dsh-data:/data busybox \
  sh -c 'cp /data/profiles/web/cordis.patch.yml /data/profiles/web/cordis.patch.yml.bak 2>/dev/null; printf "[]\n" > /data/profiles/web/cordis.patch.yml'
docker compose up -d
```

Replace `dsh-auth-docker_dsh-data` with your compose volume name (`docker volume ls | grep dsh`). Current images that include this entrypoint reset an invalid overlay automatically and keep a `.bak`.

## Root-owned files and `npm` EACCES under `/root/.npm`

The published image used to run as root, so everything under `/data` was uid 0. Official DSH sandbox (bwrap / Landlock) then mounts `/` read-only and only allows writes to the session workspace and `/tmp`. Agent `npm`/`pnpm` therefore cannot write `/root/.npm` (logs say `sudo chown -R 0:0 "/root/.npm"`), and the follow-on failure is often `ERR_MODULE_NOT_FOUND`.

Rebuild/restart with this entrypoint: it chowns `/data` to `PUID:PGID` (default `1000:1000`), drops to that user, and points npm/pnpm caches at `/tmp`. Existing volumes are fixed on the next boot unless you set `DSH_SKIP_CHOWN=1`.

If logs stop at `Corepack is about to download …/pnpm-11.22.0.tgz` and `usermod: no changes`, DSH never started: Corepack is waiting for a TTY yes/no. Recreate with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` (compose already sets this) or rebuild the image.

If logs show `EACCES: permission denied, open '…/node_modules/…/package.json'`, pnpm store files are mode `0444`. The entrypoint runs `chmod -R a+rwX` on `/data` (NAS bind mounts often ignore container `chown`). To unblock on the host without rebuilding:

```sh
docker compose stop
chmod -R a+rwX /path/to/dsh-data
docker compose up -d
```

Unresolvable rows in `dsh.profile.bundles` (half-installed plugins) are dropped on boot so `/login` can still come up; re-add them with `dsh plugin add` after permissions are fixed.

`credentials-local` refuses to boot when `$DSH_HOME/.credentials.yaml` is group- or world-readable, so the entrypoint restores mode `600` on it after the blanket `chmod`. On the host that file must also be owned by `PUID`:

```sh
chown 1000:1000 /path/to/dsh-data/.credentials.yaml
chmod 600 /path/to/dsh-data/.credentials.yaml
```
