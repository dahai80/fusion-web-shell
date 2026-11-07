---
doc_id: fusion-web-shell/config-reference
product: fusion-web-shell
class: platform
entry: service
doc_type: config-reference
title: { zh: "fusion-web-shell 配置参考", en: "fusion-web-shell config reference" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: @dahai
source_of_truth:
    - apps/shell/vite.config.ts
    - scripts/publish.sh
    - README.md
---

# 配置参考 / config reference

本仓没有运行时服务配置文件；可配置面由三部分组成：构建/开发环境变量、Vite 配置、网关侧配对配置。

This repo has no runtime service config file. The configurable surface has three parts: build/dev environment variables, the Vite config, and the paired gateway-side config.

## 环境变量 / environment variables

| 变量 / variable | 作用域 / scope | 说明 / description |
| --- | --- | --- |
| `FUSION_DEV_MODULES` | dev | `<module-id>:<port>`（可多个，逗号分隔；PRD 7.1 拼写）。将匹配模块的 iframe src 覆写为本地 Vite dev server，实现 HMR（`apps/shell/src/dev/hmr.ts`）/ `<module-id>:<port>` (comma separated; PRD 7.1 spelling). Overrides the matching module's iframe src to a local Vite dev server for HMR |
| `VITE_SHELL_ENV` | dev | 置 `dev` 时启用上面的模块 HMR 覆写 / set to `dev` to enable the module HMR override above |
| `FUSION_SHELL_SPA_DIR` | publish | 覆盖发布目标目录（默认 `~/.fusion-gateway/shell-spa`，`scripts/publish.sh`）/ overrides the publish target dir (default `~/.fusion-gateway/shell-spa`) |

Vite `envPrefix: ['VITE_', 'FUSION_']`（`apps/shell/vite.config.ts`）——`FUSION_*` 前缀的变量也会暴露到客户端，这是 PRD 7.1 的拼写约定。

Vite `envPrefix: ['VITE_', 'FUSION_']` (`apps/shell/vite.config.ts`) — `FUSION_*`-prefixed vars are exposed to the client per the PRD 7.1 spelling convention.

## Vite / dev server 配置 / config

`apps/shell/vite.config.ts` 的关键项 / key settings:

| 项 / key | 值 / value | 原因 / reason |
| --- | --- | --- |
| `base` | `'/'` | 网关在站点根同源托管（`web_shell.spa_dir`，issue #23 / gateway #247）；绝对根路径资源引用在 SPA 深链刷新后仍然有效 / gateway hosts the dist at the site root; absolute-root asset refs survive SPA deep-link refresh |
| `server.port` | `11430` | 全仓 11400-11499 段规则，已登记 `architecture/port-registry.yaml`（root 仓）/ repo-wide 11400-11499 range, registered in the workspace port registry |
| `server.proxy` | `/api`、`/admin`、`/shell` → `http://localhost:11432` | dev 时透传到网关；生产环境全部路由由网关同源提供 / dev passthrough to the gateway; in prod all routes are same-origin from the gateway |
| `build.target` | `es2020` | — |

## 发布产物约束 / publish output constraints

`scripts/publish.sh` 在以下情况显式失败退出 / `scripts/publish.sh` fails visibly when:

- `apps/shell/dist/index.html` 不存在 / is missing after the build;
- `index.html` 含相对资源路径（`(src|href)="../..."`）——提示检查 `base:'/'` / contains relative asset paths — hints at `base:'/'`;
- 无 `/assets/` 引用（构建产物形态异常）/ has no `/assets/` refs;
- `dist/assets/` 无哈希资源文件 / has no hashed assets.

发布后 rsync 同步到目标目录（`--delete` 全量镜像），并在日志中提示配对网关配置。

After publishing, rsync mirrors the dist to the target dir (`--delete`), and the log reminds you to pair the gateway config.

## 网关侧配对 / gateway-side pairing

`fusion-gateway` config.yaml（网关 v0.9.46 起，gateway #247）：

In the `fusion-gateway` config.yaml (since gateway v0.9.46, gateway #247):

```yaml
web_shell:
    spa_dir: ~/.fusion-gateway/shell-spa
```

- SPA 路由按设计不鉴权——首屏是 shell 登录页（issue #23）。
- shell origins 需登记在 `auth_portal.redirect_uris` 白名单（认证 code 换取流，gateway #506 契约）。
- The SPA route is unauthenticated by design — the first screen is the shell login (issue #23).
- Shell origins must be listed in the `auth_portal.redirect_uris` allowlist (auth code exchange contract, gateway #506).

## 会话与策略键 / session and policy keys

宿主在浏览器存储中维护（模块经 SDK 读取，不自行解析）：

Maintained by the host in browser storage (modules read via the SDK, never parse these themselves):

| 键 / key | 说明 / description |
| --- | --- |
| `localStorage["fusion.shell.model"]` / `["fusion.shell.effort"]` | 全局模型/effort 选择（`''`/`default` = 网关路由默认）；cowork、agent-studio 等同源模块直接读取 / global model/effort pick (`''`/`default` = gateway routing default); same-origin modules read these directly |
| `sessionStorage["fusion.identity.token"]` | 云试用 SSO 场景的身份 JWT（issue #130）；本地会话不写入 / identity JWT for cloud-try SSO (issue #130); not written on local sessions |
| `sessionStorage` pending-surface 标记 / pending-surface markers | 404/501 网关面本会话记忆，避免重复请求 / per-session memory of pending gateway surfaces, prevents repeat requests |
| `fusion.shell.delegations` | Home 聊天委托审计（`{ts, prompt, route, reason}`，上限 50）/ Home chat delegation audit log, capped at 50 |

## 端口 / ports

- shell dev server：11430（`apps/shell/vite.config.ts`）。
- fusion-gateway：11432（会话、RBAC、manifest 注册中心、静态托管）。
- 端口唯一权威来源是 workspace 根的 `architecture/port-registry.yaml`。
- Shell dev server: 11430 (`apps/shell/vite.config.ts`).
- fusion-gateway: 11432 (session, RBAC, manifest registry, static hosting).
- The single source of truth for ports is the workspace root `architecture/port-registry.yaml`.
