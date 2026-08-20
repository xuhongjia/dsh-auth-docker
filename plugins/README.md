# Extra DeepSeek Harness bundles

English | [中文](#中文)

Each folder under `plugins/` is one DSH bundle (`package.json` + `cordis.patch.yml` + `src/`). The Docker image runs `dsh plugin --profile web add` on every folder. Add a new plugin by copying this layout; do not edit another plugin's patch.

Local install:

```sh
pnpm install && pnpm build
dsh plugin --profile web add ./plugins/dsh-auth
dsh plugin --profile web add ./plugins/dsh-cursor-plugin
```

---

# 中文

`plugins/` 下每个文件夹是一个 DSH bundle。Docker 会对每个目录执行 `dsh plugin --profile web add`。新插件照这个目录结构加，不要改别的插件的 patch。
