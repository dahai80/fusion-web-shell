---
doc_id: fusion-web-shell/get-started
product: fusion-web-shell
class: platform
entry: service
doc_type: get-started
title: { zh: "fusion-web-shell 快速开始", en: "fusion-web-shell get started" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: "@dahai"
source_of_truth:
    - README.md
    - apps/shell/vite.config.ts
    - scripts/publish.sh
---

# 快速开始 / get started

## 前置条件 / prerequisites

- Bun >= 1.1（README 指定）。
- fusion-gateway 在 :11432 运行时，端到端功能（登录、manifest 注册、模块托管）才完整；纯前端开发可不依赖。
- Bun >= 1.1 (stated in README).
- End-to-end behavior (login, manifest registry, module hosting) requires fusion-gateway on :11432; pure frontend development does not.

## 安装与运行 / install and run

```bash
bun install
bun run dev         # shell dev server on :11430, /api proxied to gateway :11432
```

打开 `http://localhost:11430`。dev server 将 `/api`、`/admin`、`/shell` 代理到网关 :11432（见 `apps/shell/vite.config.ts`）。

Open `http://localhost:11430`. The dev server proxies `/api`, `/admin`, `/shell` to the gateway on :11432 (see `apps/shell/vite.config.ts`).

## 全量门禁 / full gate

```bash
bun run check       # typecheck + lint (biome) + build + test
```

单项命令 / individual commands:

```bash
bun run typecheck   # tsc across workspaces
bun run lint        # biome check --error-on-warnings
bun run build       # typecheck + build all workspaces
bun run test        # bun test
```

CI 在每个 PR 上跑 lint + typecheck + test + build（`.github/workflows/ci.yml`）。

CI runs lint + typecheck + test + build on every PR (`.github/workflows/ci.yml`).

## 模块开发 HMR / module development HMR

模块 iframe 指向本地 Vite dev server：

Point a module iframe at a local Vite dev server:

```bash
VITE_SHELL_ENV=dev FUSION_DEV_MODULES=cowork:5173 bun run dev
```

匹配 id 的模块 iframe src 会被覆写为本地 dev server 地址（`apps/shell/src/dev/hmr.ts`，经 `envPrefix: ['VITE_', 'FUSION_']` 暴露）。

The matching module's iframe src is overridden to the local dev server (`apps/shell/src/dev/hmr.ts`, exposed via `envPrefix: ['VITE_', 'FUSION_']`).

## 发布到网关 / publish to the gateway

```bash
bun run publish     # build apps/shell + verify + sync to ~/.fusion-gateway/shell-spa
# custom target: FUSION_SHELL_SPA_DIR=/some/dir bun run publish
```

脚本校验 `index.html` 使用绝对根路径 `/assets/` 引用且哈希资源存在，失败即退出。网关侧配对配置：

The script fails visibly unless `index.html` references `/assets/` at the absolute root and hashed assets exist. Pair the gateway config:

```yaml
web_shell:
    spa_dir: ~/.fusion-gateway/shell-spa
```

## 验证 / verify

1. `bun run check` 全绿 / passes.
2. dev server :11430 打开首页，登录后侧边栏出现已注册模块。
3. Home at :11430 renders, and registered modules appear in the sidebar after login.

## 下一步 / next steps

- 接入新模块：见 `docs/guides/module-onboarding.md`。
- 网关 API 契约：见 `docs/api-reference.md`。
- 常见问题：见 `docs/troubleshooting.md`。
- Integrate a module: see `docs/guides/module-onboarding.md`.
- Gateway API contracts: see `docs/api-reference.md`.
- Common issues: see `docs/troubleshooting.md`.
