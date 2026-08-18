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
| `DSH_AUTH_BASE_URL` | Public origin, for example `http://localhost:3080` |
| `DSH_AUTH_TRUSTED_ORIGINS` | Extra comma-separated origins Better Auth accepts |
| `DSH_AUTH_SECURE_COOKIES` | Set `1` when the public origin is HTTPS |
| `PORT` | Public listen port, default `3080` |
| `DSH_HOME` | Harness home (auth sqlite, sessions, settings). Docker uses `/data` |

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
