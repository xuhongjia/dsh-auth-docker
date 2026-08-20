# dsh-auth

[English](README.md) | 中文

为官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 Better Auth 登录。本仓库 **不是 fork**。Docker 从 npm 安装 `@deepseek-ai/dsh`，再对 `plugins/` 下每个 bundle 执行 `dsh plugin --profile web add`。

官方 Web 服务拒绝 `--host 0.0.0.0`，也没有认证 middleware。本插件监听 `0.0.0.0:3080`，提供 `/login` 与 `/auth`，并把已登录的 HTTP 和 WebSocket 反代到 `127.0.0.1` 上的官方 webserver。账号密码不会进入 DSH 的模型 RPC。

## 用 Docker 运行

```sh
cp .env.example .env
# 填写 DSH_AUTH_PASSWORD、DSH_AUTH_SECRET（至少 32 个字符）；DEEPSEEK_API_KEY 可选
docker compose up --build
```

打开 `http://localhost:3080`。第一次启动会用 `DSH_AUTH_PASSWORD` 创建 `admin`。之后复用 `/data/auth/auth.sqlite`，不再读取该密码。

若前面有 HTTPS 反代（Caddy、nginx、Cloudflare），把 `DSH_AUTH_BASE_URL` 设成该 origin，并设置 `DSH_AUTH_SECURE_COOKIES=1`。

## 拉取已发布镜像

推送到 `main` 后，GitHub Actions 会构建 `linux/amd64` 和 `linux/arm64` 并发布到 GitHub Container Registry：

```text
ghcr.io/xuhongjia/dsh-auth-docker:0.0.10
ghcr.io/xuhongjia/dsh-auth-docker:latest
```

第一次 workflow 成功后，到 GitHub → Packages 把包可见性改为 Public，然后：

```sh
docker pull ghcr.io/xuhongjia/dsh-auth-docker:0.0.10
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
dsh plugin --profile web add ./plugins/dsh-auth
dsh plugin --profile web add ./plugins/dsh-cursor-plugin
dsh --profile web
```

公网地址会打印为 `dsh-auth: public http://0.0.0.0:3080 → 127.0.0.1:<internal>`。

## 环境变量

| 变量 | 含义 |
|---|---|
| `DEEPSEEK_API_KEY` | 可选的官方 DeepSeek Models 密钥。也可在 Settings → Models 配置 Cursor |
| `DSH_AUTH_PASSWORD` | 初始管理员密码；仅在认证数据库没有用户时读取 |
| `DSH_AUTH_SECRET` | Better Auth 签名密钥，至少 32 个字符 |
| `DSH_AUTH_BASE_URL` | 公网 origin，例如 `http://localhost:3080` 或 `https://dsh.example.com` |
| `DSH_AUTH_TRUSTED_ORIGINS` | Better Auth 额外接受的 origin，逗号分隔 |
| `DSH_AUTH_SECURE_COOKIES` | 公网 origin 为 HTTPS 时设为 `1` |
| `PORT` | 公网监听端口，默认 `3080` |
| `DSH_HOME` | Harness home（认证 sqlite、会话、设置）。Docker 使用 `/data` |
| `PUID` / `PGID` | 容器内运行时 uid/gid，默认 `0`（root）。想降权就设成 `1000` 或宿主机用户，此时会先 chown `/data` |
| `DSH_SKIP_CHOWN` | 降权时设为 `1` 则不 chown `/data` |

## 目录

```
plugins/dsh-auth           Cordis bundle：Better Auth + 反向代理
plugins/dsh-cursor-plugin  Cursor SDK 的 loopback OpenAI 网关（Settings → Models）
Dockerfile                 npm i -g @deepseek-ai/dsh，然后对 plugins/* 逐个 dsh plugin add
```

见 [plugins/README.md](plugins/README.md) 与 [plugins/dsh-cursor-plugin/README.md](plugins/dsh-cursor-plugin/README.md)。已有 `$DSH_HOME/settings.yaml` 里的 `llm-pi-ai.providers`（例如 `opencode-go`）会和 Cursor 路由按 provider 名合并。

## 已知限制

- **还没有账号设置页** —— 当前浏览器面是 Host 登录页；用户名/密码修改可以之后做成 `dsh.client` 贡献。
- **只有一个初始账号** —— 公开注册关闭；第一个管理员只种子一次。
- **官方 Harness 仍只监听 loopback** —— 本代理才是网络入口。不要暴露内部 webserver 端口。
- **公网来源的配对心跳** —— 市场插件 `dsh-remote-web-ui` 把 `https://…` 当成局域网；浏览器没有 `dsh_pair` cookie 时，`POST /api/pair/heartbeat` 会 401 `unpaired`。已登录的 Better Auth 会话会把这条 unpaired 响应改写成 `{"ok":true}`。真正带配对 cookie 的请求仍打到上游，手机/远程桌面在线状态不受影响。扫码配对流程不变。

## 在线装插件后 `cordis.patch.yml` 损坏

官方 `dsh` 要求 `$DSH_HOME/profiles/web/cordis.patch.yml` 必须是 **YAML 数组**（`[]` 或 `- id:` 列表）。在线安装或 Agent 改文件时如果写成了 mapping、或文件被清空，启动会报 `must be a top-level YAML array`。认证库在 `/data/auth`，不要整卷删除，只复位 overlay：

```sh
docker compose stop
docker run --rm -v dsh-auth-docker_dsh-data:/data busybox \
  sh -c 'cp /data/profiles/web/cordis.patch.yml /data/profiles/web/cordis.patch.yml.bak 2>/dev/null; printf "[]\n" > /data/profiles/web/cordis.patch.yml'
docker compose up -d
```

把 `dsh-auth-docker_dsh-data` 换成你的 compose volume 名（`docker volume ls | grep dsh`）。包含当前 entrypoint 的镜像会自动复位非法 overlay，并留下 `.bak`。

## 运行用户、sandbox 的 npm 缓存，以及凭据文件权限

容器默认以 **root** 运行（`PUID=0`）。适合只 bind-mount 一个 `/data` 目录（例如 NAS 共享盘）：root 能改写 pnpm 打成 `0444` 的包，`dsh plugin add` 不会再因 EACCES 失败。只有需要降权时才设 `PUID`/`PGID`；此时入口脚本会 chown `/data` 再 `gosu` 到该用户。

官方 DSH sandbox（bwrap / Landlock）把 `/` 只读挂上，只允许写会话 workspace 和 `/tmp`。因此 npm/pnpm 缓存指到 `/tmp`，而不是 `/root/.npm`。若日志停在 Corepack 的 Yes/No 下载提示，用 `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` 重建（compose 已带）。

`credentials-local` 要求 `$DSH_HOME/.credentials.yaml` 不能被同组或其他用户读到。入口脚本每次启动都会把它设成 `600`。若主机上的 chmod 把它弄成了 `666`，也在主机上修一次：

```sh
chmod 600 /你的/dsh数据目录/.credentials.yaml
```

`dsh.profile.bundles` 里无法 resolve 的半残插件会在启动时被摘掉，保证 `/login` 能起来；再用 `dsh plugin add` 重装。
