---
doc_id: fusion-web-shell/product-page
product: fusion-web-shell
class: platform
entry: service
doc_type: product-page
title: { zh: "fusion-web-shell 产品页", en: "fusion-web-shell product page" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: "@dahai"
source_of_truth:
    - README.md
    - CLAUDE.md
    - docs/manifest-ext-schema.md
platform:
    serves: fusion-* web module UIs (agent-studio, cowork, domain apps) served as same-origin iframes
    builds_on: fusion-gateway (:11432) for session/RBAC/manifest registry/static hosting; fusion-identity for tenant identity
    hosts: apps/shell (host SPA), apps/auth (unified auth portal), packages/design-tokens + sdk + ui (shared module toolchain)
    integration_surface: web/manifest.json (PRD §5.1) + optional @fusion/web-sdk postMessage bridge; gateway serves module bundles at the /shell/ mount
    extension_points: manifest ext fields (searchProviders / pages / notifications / model_capable), @fusion/web-ui shared components, @fusion/design-tokens tokens
---

# fusion-web-shell 产品页 / product page

## 定位 / positioning

fusion-web-shell 是 fusion-* 联合前端的宿主（union web host）：单端口入口（fusion-gateway :11432）、统一登录 + RBAC、每标签同源 iframe 模块、KeepAlive 多标签、Manifest 热插拔注册、H5 响应式。

fusion-web-shell is the host of the fusion-* union web frontend: single entry via fusion-gateway (:11432), unified login + RBAC, per-tab same-origin iframe modules, KeepAlive tabs, hot-pluggable manifest registry, H5 responsive.

## 能力与边界 / capabilities and limits

### 宿主框架 / host shell

模块只交付静态 SPA 包 + `web/manifest.json`，不必再实现：标签管理、KeepAlive、登录/RBAC 判断、双语 chrome、⌘K 命令面板、通知中心、移动端抽屉布局。约束：模块 UI 新建必须用基线栈（React 18 + Vite + TS + Tailwind + Bun，UI Spec §10.1），存量栈需在 P3 收口前迁移；深链唯一形式为 `/shell/<id>/?embedded=1#/<route>`。

Modules ship a static SPA bundle plus `web/manifest.json`; they no longer write tab management, KeepAlive, login/RBAC gating, bilingual chrome, the ⌘K command palette, the notification center, or the mobile drawer layout. Constraint: new module UIs must use the baseline stack (React 18 + Vite + TS + Tailwind + Bun, UI Spec §10.1); legacy stacks migrate before P3 close-out; the only deep-link form is `/shell/<id>/?embedded=1#/<route>`.

### 统一认证 / unified auth

认证是网关 `/auth` 上的一个门户应用（apps/auth）：一次性 code 换 token（60s TTL、单次、origin 白名单），SSO ticket 流程供 fusion-site 云试用。模块不必再写登录表单或会话恢复。约束：注册类端点上游未上线（fusion-identity #39/#40、gateway #506），404/501 时门户与 shell 按双语 backend-pending 提示降级，本地表单保留为诚实回退。

Authentication is ONE portal app (apps/auth) served by the gateway at `/auth`: one-time code exchange (60s TTL, single use, origin allowlist), SSO ticket flow for fusion-site cloud-try. Modules write no login form or session restore. Constraint: registration endpoints are upstream-pending (fusion-identity #39/#40, gateway #506); on 404/501 the portal and shell degrade to a bilingual backend-pending notice, and the local form stays as the honest fallback.

### SDK 桥 / SDK bridge

`@fusion/web-sdk` 提供 postMessage 桥：http 代理（宿主自动附 Bearer）、toast、tab API、theme/lang/visibility 订阅、`auth.identityToken()`、模型策略解析（`sdk.model.get/subscribe/env`）。模块不必再处理 token 注入、429 配额分类或心跳。约束：桥只覆盖 `types.ts` 声明的方法；心跳失联判定仅对回应过 ping 的 SDK 模块生效。

`@fusion/web-sdk` provides the postMessage bridge: http proxy (host attaches the Bearer token), toast, tab API, theme/lang/visibility subscriptions, `auth.identityToken()`, and model-policy resolution (`sdk.model.get/subscribe/env`). Modules no longer handle token injection, 429 quota classification, or heartbeats. Constraint: the bridge covers only the methods declared in `types.ts`; liveness-expiry applies only to SDK modules that answered a ping.

### 共享设计系统 / shared design system

`@fusion/design-tokens`（色板/间距/圆角/字号，暗+亮）+ `@fusion/web-ui`（StatusBadge、LogStream、MetricChart、DataTable、TaskProgress、EmptyState/ErrorState/Skeleton、格式化工具、H5 原语）。模块不必再自绘基础组件或维护私有主题值。约束：模块私有主题值已废弃，须 vendor 同步 `@fusion/design-tokens`；z-index 阶梯（0/50/60/70）与按钮层级由 token 固定，Toast 永远在最上层。

`@fusion/design-tokens` (palette/spacing/radius/type, dark+light) plus `@fusion/web-ui` (StatusBadge, LogStream, MetricChart, DataTable, TaskProgress, EmptyState/ErrorState/Skeleton, formatters, H5 primitives). Modules no longer hand-draw base components or maintain private theme values. Constraint: module-private theme values are deprecated — vendor-sync `@fusion/design-tokens`; the z-index ladder (0/50/60/70) and button tiers are token-pinned, and toast renders above every overlay.

### 模型策略与配额 / model policy and quota

模型解析链：模块 override > 用户偏好（allowlist 约束）> 租户默认 > 构建期回退；`privacy_mode=all|local-only` 隐藏云模型；网关按用户 `sub` 计量每日 token 配额，SDK 识别 429 配额错误且不重试。模块不必再实现模型选择 UI 的策略部分。约束：`GET/PUT /api/v1/model-policy`、`GET /api/v1/model-preference` 未上线（gateway #486）时显示 gateway-pending 提示，解析回退到用户偏好层。

Model resolution chain: module override > user preference (allowlist-constrained) > tenant default > build-time fallback; `privacy_mode=all|local-only` hides cloud models; the gateway meters the daily token quota by user `sub`, and the SDK classifies 429 quota errors and never retries them. Modules do not implement the policy side of model selection. Constraint: while `GET/PUT /api/v1/model-policy` and `GET /api/v1/model-preference` are pending (gateway #486), the section shows a gateway-pending notice and resolution falls back to the user preference layer.

### 管理面 / admin surfaces

`/settings`（API keys：scope 矩阵、明文仅一次性揭示、轮换/吊销；模型策略管理）、`/users`（用户 CRUD/Roles/菜单权限矩阵）、`/audit`（哈希链审计，防篡改标记）。模块不必再写各自的用户或密钥管理页。约束：均依赖网关会话门控面（gateway #271/#272、E5 identity contract），未上线时降级为 gateway-pending 提示。

`/settings` (API keys: scope matrix, one-time plaintext reveal, rotate/revoke; model policy admin), `/users` (users CRUD / roles / menu permission matrix), `/audit` (hash-chained trail with tampered markers). Modules do not write their own user or key management pages. Constraint: all depend on session-gated gateway surfaces (gateway #271/#272, the E5 identity contract) and degrade to a gateway-pending notice until shipped.

## 非目标 / non-goals

- 不做业务逻辑：所有领域行为在各 fusion-* 模块仓内。
- 不直连推理引擎：模块 LLM 流量必须经网关计量端点，禁止绕过 :11432 直连 MLX。
- No business logic: all domain behavior lives in the individual fusion-* module repos.
- No direct engine access: module LLM traffic goes through the gateway metering endpoint, never straight to MLX.

## 相关项目 / related

- `fusion-gateway` (Go, :11432) — 会话、RBAC、manifest 注册中心、静态托管。
- `fusion-identity` — 租户/身份底座，SSO ticket 与用户角色来源。
- `fusion-studio` (SwiftUI) — 桌面端兄弟客户端，PRD 要求术语与功能对齐。
- `fusion-gateway` (Go, :11432) — session, RBAC, manifest registry, static hosting.
- `fusion-identity` — tenant/identity backbone, source of SSO tickets and user roles.
- `fusion-studio` (SwiftUI) — the desktop sibling client; the PRD requires terminology/feature parity.
