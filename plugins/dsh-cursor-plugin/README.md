# dsh-cursor-plugin

English | [中文](#中文)

Loopback OpenAI-compatible gateway for a Cursor dashboard API key (`crsr_…`). DeepSeek Harness **Settings → Models** shows a Cursor card; paste the key there. `llm-pi-ai` calls `http://127.0.0.1:3090/v1`. The Harness agent loop still runs DSH tools and skills.

This is not Cloud Agents (`POST /v1/agents`). The gateway uses the official `@cursor/sdk` local agent with `tools: []` so Cursor's own shell/edit tools are not offered. If the SDK ignores an empty toolset, it may still touch the gateway workspace (`$DSH_HOME/cursor-gateway`). Do not point `CURSOR_BASE_URL` at `https://api.cursor.com`.

## Use

1. Log in to the Harness Web UI.
2. Open Settings → Models → Cursor.
3. Paste the dashboard key. It is stored write-only in `$DSH_HOME/.credentials.yaml`.
4. Select a Cursor model (default `composer-2.5`, or Fetch available models).

## Existing `llm-pi-ai` in settings.yaml

`$DSH_HOME/settings.yaml` already having `llm-pi-ai.providers` (for example `opencode-go`) does **not** wipe this plugin. DSH merges that document **per provider key** with the composition base: `opencode-go` stays, `cursor` is added. `agent-default-model` is unchanged until you pick a Cursor model. A user-layer `providers.cursor` entry would overlay this plugin's defaults.

Another **plugin** that also patches `id: llm-pi-ai` would replace the whole composition `config` (last add wins). Do not put a second Cursor-style provider patch in another bundle.

## Layout

```
src/                 Cordis plugin + HTTP gateway
cordis.patch.yml     Inserts this plugin and a llm-pi-ai cursor route
```

---

# 中文

把 Cursor 后台 API Key（`crsr_…`）变成 DSH 能调的 loopback OpenAI 接口。登录后在 **Settings → Models** 的 Cursor 卡片里填 Key。`llm-pi-ai` 请求 `http://127.0.0.1:3090/v1`。会话里的 tools / skills 仍由 DSH 执行。

这不是 Cloud Agents。网关用官方 `@cursor/sdk` 本地 agent，并设置 `tools: []`，尽量不提供 Cursor 自带的 shell/写文件。若 SDK 无视空 toolset，仍可能改网关工作区（`$DSH_HOME/cursor-gateway`）。不要把地址填成 `https://api.cursor.com`。

全局 `$DSH_HOME/settings.yaml` 里已有的 `llm-pi-ai.providers`（例如 `opencode-go`）会和本插件 **按 provider 名合并**：原来的路由还在，只是多一条 `cursor`。`agent-default-model` 不会被改掉。若用户层已经写了 `providers.cursor`，会覆盖本插件的默认值。另一个插件如果也 patch `id: llm-pi-ai`，会整段替换 composition config（后装的生效）。
