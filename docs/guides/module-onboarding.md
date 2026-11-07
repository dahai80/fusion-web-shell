---
doc_id: fusion-web-shell/guide/module-onboarding
product: fusion-web-shell
class: platform
entry: service
doc_type: guide
title: { zh: "模块接入指南", en: "Module onboarding guide" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: "@dahai"
source_of_truth:
    - README.md
    - docs/manifest-ext-schema.md
    - docs/module-integration-notes.md
---

# 模块接入指南 / Module onboarding guide

任意 fusion-* 模块把 Web UI 接入 shell 的步骤。契约细节见 `docs/module-integration-notes.md` 与 `docs/manifest-ext-schema.md`。

Steps to integrate any fusion-* module's web UI into the shell. Contract details live in `docs/module-integration-notes.md` and `docs/manifest-ext-schema.md`.

## 步骤 / steps

1. **manifest**：仓内提供 `web/manifest.json`，schema 见 PRD §5.1；扩展字段（`pages`/`searchProviders`/`notifications`/`model_capable`/`suggested_model`）全部可选。
2. **构建**：产出普通静态 SPA 包；`fusion-gateway` 将其托管在 `/shell/<id>/`。
3. **SDK（可选）**：依赖 `@fusion/web-sdk` 获得宿主 API（http 代理、toast、tab、theme、model），可选 `@fusion/web-ui` 共享组件。
4. **开发模式**：`VITE_SHELL_ENV=dev FUSION_DEV_MODULES=<id>:<port> bun run dev`，宿主把该模块 iframe 指向本地 Vite dev server。
5. **注册与授权**：模块在网关 manifest 注册中心注册并完成 RBAC 授权后，出现在 shell 侧边栏。
6. **manifest**: provide `web/manifest.json` in your repo (schema: PRD §5.1); extension fields (`pages`/`searchProviders`/`notifications`/`model_capable`/`suggested_model`) are all optional.
7. **build**: produce a plain static SPA bundle; `fusion-gateway` hosts it at `/shell/<id>/`.
8. **SDK (optional)**: depend on `@fusion/web-sdk` for host APIs (http proxy, toast, tab, theme, model) and optionally `@fusion/web-ui` shared components.
9. **dev mode**: `VITE_SHELL_ENV=dev FUSION_DEV_MODULES=<id>:<port> bun run dev` points the module's iframe at a local Vite dev server.
10. **registration**: after the module is registered in the gateway manifest registry and RBAC-granted, it appears in the shell sidebar.

## 基线栈约束 / baseline stack constraint

新建模块 UI 必须使用基线栈：React 18 + Vite + TS + Tailwind + Bun（UI Spec §10.1）。存量前端可在过渡期以现有栈接入，P3 收口前迁移基线。

New module UIs must use the baseline stack: React 18 + Vite + TS + Tailwind + Bun (UI Spec §10.1). Existing frontends may integrate with their current stack during the transition and must migrate before P3 close-out.

## 常见坑 / common pitfalls

- 深链只用 `/shell/<id>/?embedded=1#/<route>`。
- 模块不自行处理 401/429——经 SDK 代理的调用由宿主统一处理。
- 模块私有主题值已废弃：vendor 同步 `@fusion/design-tokens`。
- 模块 LLM 调用指向网关计量端点，不直连引擎。
- Only deep-link via `/shell/<id>/?embedded=1#/<route>`.
- Modules never handle 401/429 themselves — calls via the SDK proxy are handled by the host.
- Module-private theme values are deprecated: vendor-sync `@fusion/design-tokens`.
- Module LLM calls point at the gateway metering endpoint, never directly at the engine.
