---
doc_id: fusion-web-shell/troubleshooting
product: fusion-web-shell
class: platform
entry: service
doc_type: troubleshooting
title: { zh: "fusion-web-shell 故障排查", en: "fusion-web-shell troubleshooting" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: @dahai
source_of_truth:
    - README.md
    - docs/manifest-ext-schema.md
    - scripts/publish.sh
    - apps/shell/vite.config.ts
---

# 故障排查 / troubleshooting

## 构建 / 依赖 / build and dependencies

**`bun run check` 类型或 lint 失败 / typecheck or lint failures**

1. `bun install` 后重试——Bun workspaces 的包间依赖是 `workspace:*` 协议，锁文件不同步会先报假错误。
2. 单独跑 `bun run typecheck` 与 `bun run lint`（biome）定位到具体 workspace。
3. Retry after `bun install` — inter-package deps use the `workspace:*` protocol; a stale lockfile reports misleading errors first.
4. Isolate with `bun run typecheck` and `bun run lint` (biome) per workspace.

**`bun test` 失败 / test failures**

`bun test` 需要 DOM 环境；本仓用 `@happy-dom/global-registrator`（root `package.json` devDependencies）。确认 bun 版本 >= 1.1 后再排查用例本身。

`bun test` needs a DOM environment; this repo registers `@happy-dom/global-registrator` (root `package.json` devDependencies). Confirm bun >= 1.1 before debugging the individual case.

## 发布 / publish

**`publish` 报 "index.html contains relative asset paths" / publish fails on relative asset paths**

`apps/shell/vite.config.ts` 的 `base` 必须是 `'/'`。相对路径资源在网关站点根托管 + SPA 深链刷新场景下会 404（issue #23）。修正后重跑 `bun run publish`。

`base` in `apps/shell/vite.config.ts` must be `'/'`. Relative asset refs 404 under gateway site-root hosting after an SPA deep-link refresh (issue #23). Fix and rerun `bun run publish`.

**`publish` 报无哈希资源 / publish fails on missing hashed assets**

`dist/assets/` 为空说明构建产物形态异常，先单独跑 `bun run build --filter '@fusion/shell'` 复现，不要手工改 dist。

An empty `dist/assets/` means unexpected build output; reproduce with the shell build alone first. Never hand-edit dist.

**发布后页面空白 / blank page after publish**

网关侧 `web_shell.spa_dir` 未配置或指向旧目录。确认 config.yaml 配对：

The gateway `web_shell.spa_dir` is unset or points at a stale dir. Confirm the pairing:

```yaml
web_shell:
    spa_dir: ~/.fusion-gateway/shell-spa
```

## 运行时 / runtime

**登录后侧边栏没有模块 / no modules in the sidebar after login**

1. 模块需在网关 manifest 注册中心注册且 RBAC 授权（可见性 = 注册 + RBAC，issue #100）。
2. 网关目录 API 不可达（404/501）时 shell 标记 `gatewayPending`，侧边栏按 manifest-only 渲染——这是设计好的降级，不是 bug。
3. Modules must be registered in the gateway manifest registry and RBAC-granted (visibility = registration + RBAC, issue #100).
4. If the gateway catalog API is unreachable (404/501), the shell pins `gatewayPending` and renders manifest-only — designed degradation, not a bug.

**模块标签显示"不可用" / tab shows the module-unavailable page**

心跳过期的模块保留菜单项、灰点 + 不可用页（issue #100）。点重试会重新探测网关健康，恢复后就地挂载。若持续失败，用 `fusion-sv status` 检查模块服务是否在线。

Heartbeat-expired modules keep their menu entry with a gray dot and the module-unavailable page (issue #100). Retry re-probes gateway health and remounts on recovery. If it keeps failing, check the module service with `fusion-sv status`.

**模块 LLM 调用返回 429 / module LLM call returns 429**

每日 token 配额超限（网关按用户 `sub` 计量，issue #130）。SDK 已分类（`isQuotaExceededError`）且不重试；宿主展示双语提示"今日 Token 额度已用完，明天自动恢复 / Daily token quota exceeded — resets tomorrow"。次日自动恢复，无需操作。

Daily token quota exceeded (gateway meters by user `sub`, issue #130). The SDK classifies it (`isQuotaExceededError`) and never retries; the host shows the bilingual notice. It resets automatically the next day.

**模块调用 401 / module call returns 401**

shell 会话过期时宿主探测 `HEAD /auth` 并重定向认证门户（issue #126）。若门户未部署，`HEAD /auth` 失败，本地登录表单是回退路径。模块不要自行处理 401 重定向——经 SDK `http` 代理的调用由宿主统一处理。

On an expired shell session the host probes `HEAD /auth` and redirects to the auth portal (issue #126). If the portal is not deployed the probe fails and the local login form is the fallback. Modules never handle 401 redirects themselves — calls via the SDK `http` proxy are handled by the host.

**页面出现 "gateway pending" 静默徽标 / a muted "gateway pending" badge appears**

对应网关面（adapters/connectors/roles/menu-permissions/audit/config 等）尚未上线，首次 404/501 后本会话记忆、不再重复请求（issue #46）。网关落地后刷新即恢复。这不是错误状态。

The corresponding gateway surface (adapters/connectors/roles/menu-permissions/audit/config) is not shipped yet; after one 404/501 it is remembered for the session with no repeat requests (issue #46). Refreshing after the gateway ships clears it. Not an error state.

**⌘K 搜不到某模块内容 / ⌘K finds nothing for a module**

跨模块搜索依赖 manifest `searchProviders` 声明（`docs/manifest-ext-schema.md`）；无声明的模块不参与搜索。单个 provider 失败被隔离，其余照常。

Cross-module search requires manifest `searchProviders` (`docs/manifest-ext-schema.md`); modules without it are not searchable. A failing provider is isolated, others keep working.

## 模块接入 / module integration

**模块 iframe 白屏 / module iframe is blank**

1. 确认模块包已被网关挂在 `/shell/<id>/`（直接浏览器访问该路径）。
2. 深链必须用唯一形式 `/shell/<id>/?embedded=1#/<route>`，其他形式不保证。
3. dev HMR 覆写需同时带 `VITE_SHELL_ENV=dev` 与 `FUSION_DEV_MODULES=<id>:<port>`，缺一会退回网关地址。
4. Confirm the module bundle is mounted by the gateway at `/shell/<id>/` (open the path directly).
5. Deep links must use the only supported form `/shell/<id>/?embedded=1#/<route>`.
6. The dev HMR override needs both `VITE_SHELL_ENV=dev` and `FUSION_DEV_MODULES=<id>:<port>`; missing either falls back to the gateway address.

**模块拿不到宿主能力 / module cannot reach host capabilities**

确认模块接入了 `@fusion/web-sdk` 并回应了宿主 ping；心跳失联判定只对回应过 ping 的 SDK 模块生效。桥能力以 `packages/sdk/src/types.ts` 的 `FusionShellSdk` 为准，未声明的方法不可用。

Confirm the module integrates `@fusion/web-sdk` and answers the host ping; liveness expiry only applies to SDK modules that answered a ping. Bridge capabilities are exactly the `FusionShellSdk` interface in `packages/sdk/src/types.ts` — undeclared methods are unavailable.

**manifest 扩展字段不生效 / manifest extension fields have no effect**

字段在加载时清洗，词表与必填结构见 `docs/manifest-ext-schema.md`；网关透传扩展字段是上游事项（gateway #252/#264 已落地 passthrough，新字段需网关跟进）。改完 manifest 后重新注册并刷新 shell。

Fields are sanitized on load; the vocabulary and required shapes are in `docs/manifest-ext-schema.md`. Gateway pass-through for new fields is an upstream matter (gateway #252/#264 landed the existing passthrough). Re-register the manifest and refresh the shell after changes.

## 诊断顺序 / diagnostic order

1. `bun run check` 全绿排除本仓问题 / rule out this repo first.
2. `curl -s http://localhost:11432/` 确认网关在位 / confirm the gateway is up.
3. 浏览器 devtools：网络面板看 401/404/429/501 的具体路径，对照 `docs/api-reference.md` 的降级语义 / check which path returned 401/404/429/501 and match it against the degradation semantics in `docs/api-reference.md`.
4. 网关侧问题到 `fusion-gateway` 仓提 issue；shell 侧到本仓提 issue。
5. Gateway-side problems get an issue in the `fusion-gateway` repo; shell-side in this repo.
