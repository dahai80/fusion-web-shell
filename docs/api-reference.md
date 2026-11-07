---
doc_id: fusion-web-shell/api-reference
product: fusion-web-shell
class: platform
entry: service
doc_type: api-reference
title: { zh: "fusion-web-shell API 参考", en: "fusion-web-shell API reference" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: @dahai
source_of_truth:
    - packages/sdk/src/types.ts
    - README.md
    - docs/manifest-ext-schema.md
---

# API 参考 / API reference

本文覆盖两层接口：模块侧 SDK 桥（`@fusion/web-sdk`）与 shell 消费的网关 HTTP 面。本仓不实现后端；网关侧契约在 `fusion-gateway` 仓，上游未上线的端点均按 gateway-pending 模式降级（404/501 → 双语提示 + sessionStorage 记忆，不再重复请求）。

This document covers two layers: the module-side SDK bridge (`@fusion/web-sdk`) and the gateway HTTP surface the shell consumes. This repo implements no backend; gateway contracts live in the `fusion-gateway` repo, and upstream-pending endpoints degrade via the gateway-pending pattern (404/501 → bilingual notice, remembered in sessionStorage, no repeat requests).

## SDK 桥 / SDK bridge

创建：`createShellSdk(options?)`，options `{origin?, timeoutMs? = 15000, retries? = 2}`。类型见 `packages/sdk/src/types.ts` 的 `FusionShellSdk`。

Construction: `createShellSdk(options?)` with `{origin?, timeoutMs? = 15000, retries? = 2}`. Types: `FusionShellSdk` in `packages/sdk/src/types.ts`.

| 方法 / method | 说明 / description |
| --- | --- |
| `http.request/get/post/put/delete` | 经宿主代理的 API 调用，宿主自动附会话 Bearer token；返回 `{status, ok, data}` / API calls relayed through the host, which attaches the session Bearer token; returns `{status, ok, data}` |
| `toast.show({level, message, durationMs?})` | 宿主 toast；level `info\|success\|warning\|error` / host toast; level `info\|success\|warning\|error` |
| `tab.setActiveTask({name}\|null)` | 声明长任务，宿主在置位时阻止关闭该标签 / declare a long-running task; the host blocks tab close while set |
| `theme.get() / theme.subscribe(cb)` | 暗亮主题读取与订阅（`dark\|light`）/ read and subscribe to the theme mode (`dark\|light`) |
| `devices.get()` | 设备信息 `{viewport, mode}` / device info `{viewport, mode}` |
| `visibility.get() / subscribe(cb)` | 标签可见性 / tab visibility |
| `i18n.lang() / t(zh, en) / subscribe(cb)` | 宿主语言（`zh\|en`）与即时翻译 / host language (`zh\|en`) and inline translation |
| `auth.identityToken()` | 云试用 SSO 场景的身份 JWT（issue #130）；本地会话或旧宿主返回 null / identity JWT for cloud-try SSO (issue #130); null on local sessions or older hosts |
| `model.get(moduleId?) / subscribe(cb)` | 策略链解析出的生效模型，宿主推送 `model-policy` 事件时缓存失效 / effective model per the policy chain; cache invalidated by the host `model-policy` push |
| `model.env(moduleId?)` | 完整模型环境 `ShellModelInfo`：`modelCapable`、`suggestedModel`、`platformModel`、`privacyMode`、`allowlist`（issue #118）/ full model environment `ShellModelInfo` (issue #118) |

错误信封：桥错误携带 `{code, message, status?}`；`status: 429` 且 body 为每日 token 配额超限时，SDK 分类为配额错误（`isQuotaExceededError`）且不重试，宿主展示双语提示（"今日 Token 额度已用完，明天自动恢复 / Daily token quota exceeded — resets tomorrow"）。

Error envelope: bridge errors carry `{code, message, status?}`; a `status: 429` daily-token-quota body is classified by the SDK (`isQuotaExceededError`) and never retried; the host surfaces a bilingual notice.

宿主推送事件 / host push events: `theme | visibility | lang | model-policy`。

## 网关 HTTP 面（shell 消费）/ gateway HTTP surface consumed by the shell

以下端点在 `fusion-gateway` 仓实现（各 issue 号为追踪源）：

These endpoints are implemented in the `fusion-gateway` repo (issue numbers are the tracking sources):

| 端点 / endpoint | 用途 / purpose | 追踪 / tracking |
| --- | --- | --- |
| `POST /auth/api/code`、`POST /auth/api/code/exchange` | 统一认证门户一次性 code（60s TTL、单次、origin 白名单）→ token 对 / auth portal one-time code (60s TTL, single use, origin allowlist) → token pair | gateway #506 |
| `POST /api/v1/shell/session/sso` | fusion-site ticket 换会话 `{ticket}` → `{token, identity_token?, username?, roles?}` / SSO ticket exchange for cloud-try | issue #130 |
| `GET/POST /api/v1/shell/keys`、`POST /api/v1/shell/keys/{name}/rotate`、`DELETE /api/v1/shell/keys/{name}` | 会话门控的用户 API keys（`fk-`）/ session-gated user API keys (`fk-`) | gateway #272 |
| `POST /api/v1/shell/chat/completions` | 会话门控的 shell 级 LLM 问答（Home 聊天线程）/ session-gated shell-level LLM chat | gateway #268 |
| `GET /api/v1/shell/models` | 全局模型/effort 选择器目录 / global model/effort catalog | gateway #443 |
| `GET/PUT /api/v1/model-policy`、`GET /api/v1/model-preference` | 模型策略面 / model policy plane | gateway #486 |
| manifest registry + catalog | 模块注册、产品目录三态（running/stopped/not-installed）/ module registration, three-state product catalog | gateway #488/#504 |
| `/shell/<id>/` 静态托管 / static hosting | 模块 SPA 同源托管 / same-origin module hosting | PRD R-1 |

约束 / constraints:

- 模块 LLM 调用必须指向网关计量端点，禁止直连引擎地址（:11434）。
- shell origins 必须登记在网关 `auth_portal.redirect_uris` 白名单。
- 待上线端点（adapters/connectors/roles/menu-permissions/audit/config 等）404/501 时 shell 标记 pending，一个静默徽标，不再重复请求。
- Module LLM calls point at the gateway metering endpoint, never directly at the engine (:11434).
- Shell origins must be registered in the gateway `auth_portal.redirect_uris` allowlist.
- Pending gateway surfaces (adapters/connectors/roles/menu-permissions/audit/config) are marked pending on 404/501 — one muted badge, no repeat requests.

## Manifest 扩展字段 / manifest extension fields

模块 `web/manifest.json`（schema：PRD §5.1）可声明（全部可选，加载时清洗；完整词表见 `docs/manifest-ext-schema.md`）：

Module `web/manifest.json` (schema: PRD §5.1) may declare (all optional, sanitized on load; full vocabulary in `docs/manifest-ext-schema.md`):

```json
{
    "searchProviders": [{ "id": "workflows", "label": "工作流", "label_en": "Workflows", "endpoint": "/api/cowork/search" }],
    "pages": [{ "route": "/runs", "title": "运行", "title_en": "Runs" }],
    "notifications": [{ "id": "approvals", "label": "审批", "endpoint": "/api/cowork/approvals?status=pending", "kind": "approvals" }],
    "model_capable": true,
    "suggested_model": "qwen3-8b-4bit"
}
```

- `searchProviders`：⌘K 跨模块搜索，`GET <endpoint>?q=<query>` → `{items: [{title, route?}]}`，防抖、单 provider 失败隔离。
- `notifications[].kind`：`approvals | runs | engine`；轮询响应 `{items: [{id, title, route?, level?, ts?}]}`，`level` 为 `info | warning | error`。
- `model_capable`/`suggested_model`：schema v3 字段，旧 manifest 缺省仍可用。
- `searchProviders`: ⌘K cross-module search, `GET <endpoint>?q=<query>` → `{items: [{title, route?}]}`, debounced, per-provider failure isolation.
- `notifications[].kind`: `approvals | runs | engine`; poll response `{items: [{id, title, route?, level?, ts?}]}` with `level` `info | warning | error`.
- `model_capable`/`suggested_model`: schema v3 fields; older manifests keep working without them.

## 错误响应形状 / error response shape

网关错误信封 `{code, message, module_id, retryable}`；`retryable` 或 5xx 触发 toast + 活动标签页错误条（PRD A5）。API 层错误统一为 `{detail: string}` + HTTP 状态码（网关侧约定）。

Gateway error envelope `{code, message, module_id, retryable}`; `retryable` or 5xx raises a toast plus a transient error strip on the active tab (PRD A5). API-level errors use `{detail: string}` with an HTTP status code (gateway convention).
