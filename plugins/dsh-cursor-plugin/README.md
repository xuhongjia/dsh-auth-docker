# dsh-cursor-plugin

English | [中文](#中文)

Loopback OpenAI-compatible gateway for a Cursor dashboard API key (`crsr_…`). DeepSeek Harness **Settings → Models** shows a Cursor card; paste the key there. `llm-pi-ai` calls `http://127.0.0.1:3090/v1`. The Harness agent loop still runs DSH tools and skills.

This is not Cloud Agents (`POST /v1/agents`) and not the `pi` CLI. The gateway uses official `@cursor/sdk` the same way [pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk) talks to Cursor (live `Cursor.models.list`, `fast` / thinking / context params, `text-delta` streaming), then exposes that as OpenAI `/v1` so DSH stays the tool host. `tools: []` plus `disallowedTools` limited to SDK names (`shell`, `task`, …) keeps Cursor's own shell off; unknown names 500 the turn. MCP stays allowed. If the SDK ignores an empty toolset, it may still touch `$DSH_HOME/cursor-gateway`. Do not point `CURSOR_BASE_URL` at `https://api.cursor.com`.

## Use

1. Log in to the Harness Web UI.
2. Open Settings → Models → Cursor.
3. Paste the dashboard key. It is stored write-only in `$DSH_HOME/.credentials.yaml`.
4. Select a Cursor model in the same DSH picker as DeepSeek/OpenAI: **one row per model**, then the reasoning control (`GPT-5.5 · High`). Context uses the model's largest window. Composer/fast defaults to **slow**.

If Settings → Models → Cursor still shows `@1m` / `(fast)` rows or only `auto`, an older `providers.cursor.models` overlay is winning. Use **Restore defaults** on that card. Do not use Fetch available models for this card — that import is id-only and drops the reasoning picker.

Advanced ids still parse if you type them: `composer-2.5:fast`, `gpt-5.5@272k`, `gpt-5.5@1m:fast:high`. OpenAI `reasoning_effort` is applied when the model id has no thinking suffix.

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

这不是 Cloud Agents，也不是 `pi` CLI。网关按 [pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk) 的方式用官方 `@cursor/sdk`（实时模型目录、`fast`/thinking/上下文参数、`text-delta` 流式），再做成 OpenAI `/v1`，tools 仍归 DSH。`tools: []` 且 `disallowedTools` 只用 SDK 合法名（`shell`、`task` 等）；写 `bash`/`web_search` 这类名字会整轮 500。MCP 不禁用。若 SDK 无视空 toolset，仍可能改 `$DSH_HOME/cursor-gateway`。不要把地址填成 `https://api.cursor.com`。

会话模型列表和官方 DSH 一样：**每个模型一行**，思考强度用旁边的 reasoning 控件（例如 `GPT-5.5 · High`）。上下文默认用该模型最大窗口。Composer / fast 默认 **slow**。若卡片里仍是 `@1m`/`(fast)` 展开项或只有 `auto`，点 **Restore defaults**。不要用 Fetch available models，那只会导入 id，reasoning 选择器会丢。

高级 id 仍可手写：`composer-2.5:fast`、`gpt-5.5@272k`、`gpt-5.5@1m:fast:high`。

全局 `$DSH_HOME/settings.yaml` 里已有的 `llm-pi-ai.providers`（例如 `opencode-go`）会和本插件 **按 provider 名合并**：原来的路由还在，只是多一条 `cursor`。`agent-default-model` 不会被改掉。若用户层已经写了 `providers.cursor`，会覆盖本插件的默认值。另一个插件如果也 patch `id: llm-pi-ai`，会整段替换 composition config（后装的生效）。
