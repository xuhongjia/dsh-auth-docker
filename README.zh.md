# dsh-auth

[English](README.md) | 中文

为官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 Better Auth 登录。本仓库 **不是 fork**。Docker 从 npm 安装 `@deepseek-ai/dsh`，再用 `dsh plugin --profile web add` 装入本 bundle。

官方 Web 服务拒绝 `--host 0.0.0.0`，也没有认证 middleware。本插件监听 `0.0.0.0:3080`，提供 `/login` 与 `/auth`，并把已登录的 HTTP 和 WebSocket 反代到 `127.0.0.1` 上的官方 webserver。账号密码不会进入 DSH 的模型 RPC。

## 用 Docker 运行

```sh
cp .env.example .env
# 填写 DEEPSEEK_API_KEY、DSH_AUTH_PASSWORD、DSH_AUTH_SECRET（至少 32 个字符）
docker compose up --build
```

打开 `http://localhost:3080`。第一次启动会用 `DSH_AUTH_PASSWORD` 创建 `admin`。之后复用 `/data/auth/auth.sqlite`，不再读取该密码。

若前面有 HTTPS 反代（Caddy、nginx、Cloudflare），把 `DSH_AUTH_BASE_URL` 设成该 origin，并设置 `DSH_AUTH_SECURE_COOKIES=1`。

## 拉取已发布镜像

推送到 `main` 后，GitHub Actions 会构建 `linux/amd64` 和 `linux/arm64` 并发布到 GitHub Container Registry：

```text
ghcr.io/xuhongjia/dsh-auth-docker:0.0.5
ghcr.io/xuhongjia/dsh-auth-docker:latest
```

第一次 workflow 成功后，到 GitHub → Packages 把包可见性改为 Public，然后：

```sh
docker pull ghcr.io/xuhongjia/dsh-auth-docker:0.0.5
# 或使用上面同一份 .env：
docker compose pull
docker compose up -d
```

## 安装到已有的官方 dsh

```sh
npm install -g @deepseek-ai/dsh
pnpm install && pnpm build
export DSH_AUTH_PASSWORD='...'
export DSH_AUTH_SECRET='...'   # 至少 32 个字符
dsh plugin --profile web add .
dsh --profile web
```

公网地址会打印为 `dsh-auth: public http://0.0.0.0:3080 → 127.0.0.1:<internal>`。

## 环境变量

| 变量 | 含义 |
|---|---|
| `DEEPSEEK_API_KEY` | 官方 Harness 模型密钥 |
| `DSH_AUTH_PASSWORD` | 初始管理员密码；仅在认证数据库没有用户时读取 |
| `DSH_AUTH_SECRET` | Better Auth 签名密钥，至少 32 个字符 |
| `DSH_AUTH_BASE_URL` | 公网 origin，例如 `http://localhost:3080` 或 `https://dsh.example.com` |
| `DSH_AUTH_TRUSTED_ORIGINS` | Better Auth 额外接受的 origin，逗号分隔 |
| `DSH_AUTH_SECURE_COOKIES` | 公网 origin 为 HTTPS 时设为 `1` |
| `PORT` | 公网监听端口，默认 `3080` |
| `DSH_HOME` | Harness home（认证 sqlite、会话、设置）。Docker 使用 `/data` |
| `PUID` / `PGID` | 容器内运行时 uid/gid，默认 `1000`（`node`）。入口脚本以 root 启动、chown `/data`，再降权。bind-mount 工作区时请改成宿主机用户 |
| `DSH_SKIP_CHOWN` | 设为 `1` 则启动时不 chown `/data` |

## 目录

```
src/           Cordis bundle：Better Auth + 反向代理
cordis.patch.yml   把官方 webserver 绑到 127.0.0.1:0，并插入本插件
Dockerfile     npm i -g @deepseek-ai/dsh，然后 dsh plugin add 本包
```

## 已知限制

- **还没有账号设置页** —— 当前浏览器面是 Host 登录页；用户名/密码修改可以之后做成 `dsh.client` 贡献。
- **只有一个初始账号** —— 公开注册关闭；第一个管理员只种子一次。
- **官方 Harness 仍只监听 loopback** —— 本代理才是网络入口。不要暴露内部 webserver 端口。

## 在线装插件后 `cordis.patch.yml` 损坏

官方 `dsh` 要求 `$DSH_HOME/profiles/web/cordis.patch.yml` 必须是 **YAML 数组**（`[]` 或 `- id:` 列表）。在线安装或 Agent 改文件时如果写成了 mapping、或文件被清空，启动会报 `must be a top-level YAML array`。认证库在 `/data/auth`，不要整卷删除，只复位 overlay：

```sh
docker compose stop
docker run --rm -v dsh-auth-docker_dsh-data:/data busybox \
  sh -c 'cp /data/profiles/web/cordis.patch.yml /data/profiles/web/cordis.patch.yml.bak 2>/dev/null; printf "[]\n" > /data/profiles/web/cordis.patch.yml'
docker compose up -d
```

把 `dsh-auth-docker_dsh-data` 换成你的 compose volume 名（`docker volume ls | grep dsh`）。包含当前 entrypoint 的镜像会自动复位非法 overlay，并留下 `.bak`。

## 文件全是 root，以及 `/root/.npm` 的 npm EACCES

旧镜像以 root 运行，`/data` 下全是 uid 0。官方 DSH sandbox（bwrap / Landlock）会把 `/` 只读挂上，只允许写会话 workspace 和 `/tmp`。Agent 跑 `npm`/`pnpm` 时写不了 `/root/.npm`（日志会提示 `sudo chown -R 0:0 "/root/.npm"`），接着经常变成 `ERR_MODULE_NOT_FOUND`。

用当前入口脚本重建并重启：启动时把 `/data` chown 成 `PUID:PGID`（默认 `1000:1000`），降到该用户，并把 npm/pnpm 缓存指到 `/tmp`。已有 volume 会在下次启动时修好，除非设置 `DSH_SKIP_CHOWN=1`。

若日志停在 `Corepack is about to download …/pnpm-11.22.0.tgz` 和 `usermod: no changes`，说明 DSH 还没启动：Corepack 在等 TTY 上的 yes/no。用 `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` 重建容器（compose 已带），或重建镜像。

若日志出现 `EACCES: permission denied, open '…/node_modules/…/package.json'`，那是 pnpm store 文件权限为 `0444`。入口脚本会在 chown 后对 `/data` 执行 `chmod -R u+w`。不等新镜像时可以先：

```sh
docker compose stop
docker run --rm -v dsh-auth-docker_dsh-data:/data alpine chmod -R u+w /data
docker compose up -d
```
