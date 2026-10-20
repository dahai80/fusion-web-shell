# fusion-web-shell

Fusion 统一前端宿主（union-web host）—— fusion-* 系列模块的统一 Web 入口。

单端口入口（`fusion-gateway` :11432）、统一登录 + RBAC、Per-Tab 同源 iframe 模块、KeepAlive 多 Tab、Manifest 热插拔注册、H5 响应式。

## 状态

宿主 Shell 已实现（issue #1-#7 + PRD/UI 规范差距项）：

- 宿主桥接线（TabView ↔ SDK）：http 代理自动带 Bearer、toast/tab 事件、theme/visibility/lang 推送、30s 心跳（仅对应答过 ping 的 SDK 模块判定失联，避免误杀未接入模块）
- 刷新恢复：持久化标签页在 manifests 加载后重建，活跃流式任务标记"已中断可重试"（PRD §6.1）
- 网关错误信封 `{code,message,module_id,retryable}`：retryable/5xx 弹 toast + 活动标签页错误条（A5）
- 菜单/标签页/登录页双语（`t()`，`title_en` 支持，语言切换按钮）
- 桌面 TabStrip：崩溃/中断/错误徽标 + 活跃任务关闭确认（forceClose）；移动抽屉可关标签
- 侧边栏 "+" 多实例打开；manifests 加载指数退避自动重试（"第 N 次重试中"）；/admin/users 路由懒加载
- dev server 端口 11430（符合全仓 11400-11499 段规则，已登记 `architecture/port-registry.yaml`）

网关侧 API（登录/RBAC/Manifest 注册中心/静态托管）在 `fusion-gateway` 仓内实现（PRD R-1），端到端联调依赖其就绪。

## 宿主 GUI 升级（issue #24，fusion-all-gui-1020 §5）

- **⌘K 命令面板（G4/C1）** — 全局浮层（`⌘K` / `Ctrl+K`），三源聚合：导航（模块 + 子页深链）、快速执行（新建工作流 / 运行图 / 加载模型，仅对已授权模块显示）、跨模块搜索（manifest `searchProviders`，`GET <endpoint>?q=<query>` → `{items:[{title, route?}]}`，防抖、单 provider 失败隔离）。
- **@fusion/design-tokens（G5/C7）** — 单一来源的设计 token（色板/间距/圆角/字号，暗+亮双色），以 workspace 包发布（`packages/design-tokens`）；`@fusion/web-ui` 从它 re-export tokens.css 与 Tailwind preset。模块私有主题值废弃 —— 通过 vendor 同步消费本包。
- **通知中心（G11/C3）** — 侧边栏（及移动抽屉）铃铛，聚合审批待办 / 运行终态 / 引擎事件，数据来自 manifest `notifications` 声明的源，走既有网关面轮询（不新增后端）。已读集合持久化；点击条目深链进入模块 tab。
- **深链与子页 IA（C8）** — 唯一深链形 `/shell/<id>/?embedded=1#/<route>`（tab src = `${entry}#${route}`）。模块通过 manifest `pages`（`{route, title, title_en?}`）声明子页即可从宿主菜单与面板直达；同路由再开仅激活 tab 不重载（KeepAlive 保持）。

Manifest schema v1 扩展字段（全部可选，加载时清洗；网关透传该字段为上游事项）：

```json
{
    "searchProviders": [{ "id": "workflows", "label": "工作流", "label_en": "Workflows", "endpoint": "/api/cowork/search" }],
    "pages": [{ "route": "/runs", "title": "运行", "title_en": "Runs" }],
    "notifications": [{ "id": "approvals", "label": "审批", "endpoint": "/api/cowork/approvals?status=pending", "kind": "approvals" }]
}
```

`notifications[].kind` 取值 `approvals | runs | engine`；轮询响应为 `{items: [{id, title, route?, level?, ts?}]}`，`level` 取值 `info | warning | error`。

完整 schema addendum（复制即用 manifest 示例 + 双侧校验词表）：[`docs/manifest-ext-schema.md`](docs/manifest-ext-schema.md)（#26）。

- PRD：`~/fusion/architecture/fusion-union-web-prd-1015.md`
- 前端统一规范：`~/fusion/architecture/fusion-web-ui-spec-1015.md`

## 开发

需要 Bun >= 1.1。

```bash
bun install
bun run dev         # Shell dev server :11430，/api 代理到网关 :11432
bun run build       # 各 workspace typecheck + build
bun run test        # bun test 全仓测试
bun run lint        # biome check
bun run typecheck   # tsc 全仓类型检查
```

模块 iframe Dev HMR：`VITE_SHELL_ENV=dev FUSION_DEV_MODULES=<id>:<port> bun run dev`，指定模块的 iframe src 覆写为本地 dev server。

CI 门禁：每个 PR 上 lint + typecheck + test + build 三绿/四绿（`.github/workflows/ci.yml`）。

## 发布（网关同源托管）

配置 `web_shell.spa_dir` 后，`fusion-gateway` 在根路径同源托管 Shell SPA（网关 v0.9.46，`/#247`）：`"/"` 兜底路由 + `index.html` 回退位于所有 API 命名空间之下，`index.html` 以 `no-store` 下发，`assets/*` 带 vite hash 命名、immutable 缓存。

```bash
bun run publish        # 构建 apps/shell + 校验 + 同步到 ~/.fusion-gateway/shell-spa
# 自定义目标：FUSION_SHELL_SPA_DIR=/some/dir bun run publish
```

脚本在 `index.html` 出现相对资源路径或哈希资源缺失时立即报错退出。网关侧配置配对：

```yaml
web_shell:
    spa_dir: ~/.fusion-gateway/shell-spa
```

SPA 路由按设计不鉴权 — 首屏保持 Shell 登录页（见 issue #23）。

## Monorepo 结构（Bun workspaces）

```
apps/shell        # 宿主 Shell：React 18 + Vite + TS + Tailwind + Zustand
                  #   Tab Manager（display:none KeepAlive）、Per-Tab 同源 iframe
                  #   加载器（/shell/<id>/）、Manifest 客户端、宿主 ErrorBoundary、
                  #   统一 HTTP 客户端、Dev HMR 切换、⌘K 命令面板、通知中心、
                  #   桌面侧边栏/移动底部导航双形态
packages/design-tokens # @fusion/design-tokens — 单一来源设计 token
                  #   （色板/间距/圆角/字号，暗+亮）：TS + CSS 变量 + 生成的
                  #   Tailwind preset
packages/sdk      # @fusion/web-sdk — postMessage 桥客户端：
                  #   http 代理（自动带宿主 token）、toast、tab API、theme、devices 探测
packages/ui       # @fusion/web-ui — 从 @fusion/design-tokens re-export token/preset，
                  #   公共组件（StatusBadge/LogStream/MetricChart/DataTable/
                  #   TaskProgress/EmptyState/ErrorState/Skeleton）、格式化工具、
                  #   H5 布局原语
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
