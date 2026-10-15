# fusion-web-shell

Fusion 统一前端宿主（union-web host）—— fusion-* 系列模块的统一 Web 入口。

单端口入口（`fusion-gateway` :11432）、统一登录 + RBAC、Per-Tab 同源 iframe 模块、KeepAlive 多 Tab、Manifest 热插拔注册、H5 响应式。

## 状态

设计阶段，实现未开始。

- PRD：`~/fusion/architecture/fusion-union-web-prd-1015.md`
- 前端统一规范：`~/fusion/architecture/fusion-web-ui-spec-1015.md`

## Monorepo 结构（Bun workspaces）

```
apps/shell        # 宿主 Shell：React 18 + Vite + TS + Tailwind + Zustand
                  #   Tab Manager（display:none KeepAlive）、Per-Tab 同源 iframe
                  #   加载器（/shell/<id>/）、Manifest 客户端、宿主 ErrorBoundary、
                  #   统一 HTTP 客户端、Dev HMR 切换、桌面侧边栏/移动底部导航双形态
packages/sdk      # @fusion/web-sdk — postMessage 桥客户端：
                  #   http 代理（自动带宿主 token）、toast、tab API、theme、devices 探测
packages/ui       # @fusion/web-ui — 设计 token、Tailwind preset、公共组件
                  #   （StatusBadge/LogStream/MetricChart/DataTable/TaskProgress/
                  #   EmptyState/ErrorState/Skeleton）、格式化工具、H5 布局原语
docs/             # 架构笔记与 ADR
```

## 模块接入（任意 fusion-* 模块）

1. 仓内提供 `web/manifest.json`（Schema 见 PRD §5.1）
2. 构建普通静态 SPA 包，`fusion-gateway` 托管在 `/shell/<id>/`
3. 可选依赖 `@fusion/web-sdk`（+ `@fusion/web-ui`）获得宿主 API 与公共组件
4. Dev 模式：`FUSION_DEV_MODULES=<id>:<port>` 指向本地 Vite dev server 即 HMR

新建模块 UI 必须使用统一技术栈基线（React 18 + Vite + TS + Tailwind + Bun），见规范 §10.1；存量前端可在过渡期以现有栈接入，P3 收口前迁移基线。

## 许可

见 LICENSE。
