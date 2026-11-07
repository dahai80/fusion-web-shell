---
doc_id: fusion-web-shell/architecture
product: fusion-web-shell
class: platform
entry: service
doc_type: architecture
title: { zh: "fusion-web-shell 架构", en: "fusion-web-shell architecture" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: "@dahai"
source_of_truth:
    - README.md
    - CLAUDE.md
    - packages/sdk/src/types.ts
    - apps/shell/vite.config.ts
---

# 架构 / architecture

## 总览 / overview

fusion-web-shell 是 Bun workspaces monorepo，宿主 SPA 由 fusion-gateway（:11432）同源托管；业务模块是各自仓交付的静态 SPA 包，由网关挂在 `/shell/<id>/`，宿主以同源 iframe 加载。网关承担会话、RBAC、manifest 注册中心与静态托管（PRD R-1）。

fusion-web-shell is a Bun workspaces monorepo. The host SPA is hosted same-origin by fusion-gateway (:11432); business modules are static SPA bundles shipped by their own repos, mounted by the gateway at `/shell/<id>/` and loaded by the host in same-origin iframes. The gateway owns session, RBAC, the manifest registry and static hosting (PRD R-1).

## 仓库布局 / repository layout

```
apps/shell             # @fusion/shell 宿主 SPA (React 18 + Vite + TS + Tailwind + Zustand)
apps/auth              # @fusion/auth 统一认证门户 (issue #125/#126)
packages/design-tokens # @fusion/design-tokens 单一来源设计 token（暗+亮）
packages/sdk           # @fusion/web-sdk postMessage 桥客户端
packages/ui            # @fusion/web-ui 共享组件 + token re-export + H5 原语
docs/                  # 架构笔记、契约文档、指南
scripts/publish.sh     # 发布到网关 spa_dir
```

同版本 0.1.4（`@fusion/auth` 为 0.1.0）；版本号以各 `package.json` 为准。

All packages share version 0.1.4 (`@fusion/auth` is 0.1.0); the per-package `package.json` is authoritative.

## 宿主内部结构 / host internals

- **Tab Manager**：KeepAlive 经 `display:none` 实现——切走不卸载（PRD 约束），持久化标签在 manifests 加载后重建，中断的流式任务标记可重试（PRD §6.1）。
- **iframe 加载器**：每标签同源 iframe `/shell/<id>/`；深链唯一形式 `/shell/<id>/?embedded=1#/<route>`（tab src = `${entry}#${route}`）；同路由再开仅激活标签不重载。
- **Manifest 客户端**：从网关注册中心拉取，指数退避自动重试；扩展字段加载时清洗（见 `docs/manifest-ext-schema.md`）。
- **HTTP 客户端**：统一走网关；网关错误信封 `{code,message,module_id,retryable}`，retryable/5xx 弹 toast + 活动标签页错误条（A5）。
- **401/403/429 处理**：401 探测 `HEAD /auth` 并重定向门户（带回跳路径）；429 配额错误展示双语提示且不重试；pending 网关面 404/501 记入 sessionStorage，仅一个静默徽标。
- **UI 层**：桌面侧边栏（四分区 taxonomy + 三态状态点 + 两级树）/ 移动抽屉双形态；⌘K 命令面板（导航 + 快捷执行 + searchProviders 跨模块搜索）；通知中心（manifest `notifications` 源轮询）。
- **Tab Manager**: KeepAlive via `display:none` — switching tabs never unmounts (PRD constraint); persisted tabs rebuild after manifests load, and interrupted streaming tasks are marked retryable (PRD §6.1).
- **iframe loader**: per-tab same-origin iframe `/shell/<id>/`; the only deep-link form is `/shell/<id>/?embedded=1#/<route>` (tab src = `${entry}#${route}`); re-opening the same route activates the tab without reloading.
- **Manifest client**: pulls from the gateway registry with exponential-backoff retry; extension fields are sanitized on load (see `docs/manifest-ext-schema.md`).
- **HTTP client**: all traffic crosses the gateway; envelope `{code,message,module_id,retryable}` with `retryable`/5xx raising a toast plus an error strip on the active tab (A5).
- **401/403/429 handling**: 401 probes `HEAD /auth` and redirects to the portal with a safe return path; 429 quota errors surface a bilingual notice and are never retried; pending gateway surfaces are remembered in sessionStorage after one 404/501 with a single muted badge.
- **UI layer**: desktop sidebar (four-section taxonomy + three-state status dots + two-level tree) / mobile drawer dual layout; ⌘K command palette (navigation + quick actions + `searchProviders` cross-module search); notification center polling manifest `notifications` sources.

## SDK 桥协议 / SDK bridge protocol

`packages/sdk`（`@fusion/web-sdk`）是模块 iframe 与宿主之间的 postMessage 协议（`packages/sdk/src/types.ts`）：

`packages/sdk` (`@fusion/web-sdk`) is the postMessage protocol between module iframes and the host (`packages/sdk/src/types.ts`):

- 模块 → 宿主请求：`{type:'request', id, method, payload}`，method ∈ `http | toast | tab | theme | devices | model | model-env | identity-token`。
- 宿主 → 模块响应：`{type:'response', id, ok, result?, error?: {code,message,status?}}`。
- 宿主 → 模块事件：`{type:'event', event, payload}`，event ∈ `theme | visibility | lang | model-policy`。
- 心跳：宿主周期 ping；失联判定只对回应过 ping 的 SDK 模块生效，避免误杀未接入模块。
- Module → host request: `{type:'request', id, method, payload}` with method in `http | toast | tab | theme | devices | model | model-env | identity-token`.
- Host → module response: `{type:'response', id, ok, result?, error?: {code,message,status?}}`.
- Host → module event: `{type:'event', event, payload}` with event in `theme | visibility | lang | model-policy`.
- Heartbeat: the host pings periodically; liveness expiry applies only to SDK modules that answered a ping, so non-SDK modules never false-crash.

同源 iframe 是信任边界的前提：宿主与模块共享 origin，HTTP 代理附带宿主会话 token，模块不得自行处理凭据。

Same-origin iframes are the trust-boundary premise: host and modules share an origin, the HTTP proxy attaches the host session token, and modules never handle credentials themselves.

## 模型策略链 / model policy chain

生效模型解析顺序（issue #114）：模块 override > 用户偏好（allowlist 约束）> 租户全局默认 > 构建期回退。`privacy_mode=all|local-only` 隐藏云模型。策略保存后宿主向所有打开的模块标签推送 `fusion:model-policy`（桥 `model-policy` 事件），SDK 侧缓存失效。模块经 `sdk.model.get/env` 消费，不自行读策略端点。

Effective model resolution order (issue #114): module override > user preference (allowlist-constrained) > tenant global default > build-time fallback. `privacy_mode=all|local-only` hides cloud models. Saving the policy pushes `fusion:model-policy` from the host into every open module tab (bridge `model-policy` event), invalidating SDK caches. Modules consume via `sdk.model.get/env` and never read the policy endpoints themselves.

## 认证拓扑 / auth topology

- 本地流程：shell 登录页建会话（issue #23；SPA 路由不鉴权）。
- 门户流程（issue #125/#126）：401 → 探测 `HEAD /auth` → 重定向门户 → 门户调 `POST /auth/api/code` 造一次性 code（60s TTL、单次、origin 白名单）→ 回跳 → shell `POST /api/auth/exchange` 换会话。
- 云试用（issue #130）：fusion-site 把 fusion-identity 签发的一次性 ticket 附加到 workbench URL；shell 消费并剥离 `?ticket=`，`POST /api/v1/shell/session/sso` 换会话，身份 JWT 存 `sessionStorage["fusion.identity.token"]` 并经 SDK 分发给模块，网关按 `sub` 计量每日配额。
- 本地流程: the shell login page creates the session (issue #23; the SPA route is unauthenticated).
- Portal flow (issue #125/#126): 401 → probe `HEAD /auth` → redirect to the portal → the portal mints a one-time code via `POST /auth/api/code` (60s TTL, single use, origin allowlist) → redirect back → the shell exchanges it at `POST /api/auth/exchange`.
- Cloud-try (issue #130): fusion-site appends a one-time ticket issued by fusion-identity to the workbench URL; the shell consumes and strips `?ticket=`, exchanges it at `POST /api/v1/shell/session/sso`, stores the identity JWT in `sessionStorage["fusion.identity.token"]`, and distributes it to modules via the SDK while the gateway meters the daily quota by `sub`.

上游未上线的注册类端点（fusion-identity #39/#40、gateway #506）按 backend-pending 双语提示降级，本地表单保留为回退。

Upstream-pending registration endpoints (fusion-identity #39/#40, gateway #506) degrade to a bilingual backend-pending notice; the local form stays as the fallback.

## 设计 token 流 / design token flow

`packages/design-tokens` 产出 TS + CSS 变量 + 生成的 Tailwind preset；`packages/web-ui` re-export 并在其上提供共享组件。模块 vendor 同步 `@fusion/design-tokens`，私有主题值已废弃。交互层由 token 固定：z-index 阶梯 `z-base 0 < z-dropdown 50 < z-overlay 60 < z-toast 70`、elevation 层级（`fs-elev-1/2`）、按钮层级（`fs-btn-primary/-secondary/-ghost/-danger`）；Toast 永远在所有浮层之上。

`packages/design-tokens` emits TS + CSS variables + a generated Tailwind preset; `packages/web-ui` re-exports them and layers shared components on top. Modules vendor-sync `@fusion/design-tokens`; private theme values are deprecated. The interaction layer is token-pinned: z-index ladder `z-base 0 < z-dropdown 50 < z-overlay 60 < z-toast 70`, elevation tiers (`fs-elev-1/2`), button tiers (`fs-btn-primary/-secondary/-ghost/-danger`); toast renders above every overlay.

## 已知差距 / known gaps

- 网关侧会话/RBAC/注册中心端到端联调依赖 fusion-gateway 各 issue 落地（README「Status」逐项列出）。
- 停止产品的一键启动阻塞在 supervisor HTTP start API；此前离线 tooltip 提示 `fusion-sv`。
- `sectionOf` 将产品线钉入 core 分区，待 gateway #455 扩枚举后收敛。
- End-to-end runs depend on the fusion-gateway issues listed item-by-item in the README "Status" section landing.
- One-click start for stopped products is blocked on a supervisor HTTP start API; the offline tooltip hints at `fusion-sv` meanwhile.
- `sectionOf` pins product lines to the core section until gateway #455 extends the enum.
