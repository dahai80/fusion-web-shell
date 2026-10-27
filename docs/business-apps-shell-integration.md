# business 领域应用接入 Fusion Web Shell 整改指引

> 对象:`~/fusion/business/` 下尚未建 git 仓、需直接集成进 fusion-web-shell 的领域应用。
> 基线版本:fusion-web-shell **v0.1.2**。本文由 host 侧产出,各应用按 §5 清单逐项整改后回报。

## 1. 目的与范围

`~/fusion/business/` 下的领域应用没有独立 git 仓,无法走"提 issue → re-vendor SDK"的常规整改链路,本文件即为其整改指令。目标:每个应用作为标准 shell 模块接入 fusion-web-shell(v0.1.2),通过 gateway `:11432` 单一入口访问,主题/语言/API 全部经 `@fusion/web-sdk` 桥接,消除各仓手写 postMessage、手写 fetch、过期 manifest 的碎片化状态。

范围(2026-10-27 审计):

| 应用 | 状态 |
|---|---|
| ai-family / ai-hr-automation / charactervoice / fit-ai / surl-school-booking-agent / ai-speech-exam / ai-apparelmockup / customer-insight | 在册,按 §5 整改 |
| voice2text | Android(Kotlin),无 Web 端,不适用 |
| fusion-carvideo | fusion-cowork 插件(其 manifest.json 是节点清单,非 shell manifest),不适用 |
| CarVedioAgent / ai-information-search / environmental-agent | 空壳脚手架,需要 Web 端时再按本契约接入 |

## 2. 接入契约(所有模块统一)

与有仓模块完全一致,四步:

1. **manifest**:交付 `web/manifest.json`,schema 见 PRD §5.1、字段参考 `docs/manifest-ext-schema.md`。硬校验(gateway `internal/shell/manifest.go` 强制,不满足直接拒绝):
   - `id` 必须带 `fusion-` 前缀(如 `fusion-ai-family`)
   - `category` 只能是 `platform | domain | infra | dev`(业务域应用用 `domain`)
   - 服务路径与 `entry` 一致:`/shell/<id>/`
2. **静态 SPA**:基线栈 React 18 + Vite + TS + Tailwind + Bun,产物为纯静态 bundle,由 gateway 挂在 `/shell/<id>/`。构建产物不要硬编码 host 端口,API 走相对路径(见 §4)。
3. **SDK**:依赖 `@fusion/web-sdk`(≥ v0.1.2),消费方式见 §3。禁止手写 postMessage 桥、禁止手写主题 localStorage 同步。
4. **注册与开发态**:manifest 注册 `POST /api/v1/shell/manifests`(或随 gateway 静态托管);本地 HMR 用 shell 的 `FUSION_DEV_MODULES=<id>:<vite端口>`。

## 3. SDK 消费方式(business 仓专用)

有仓模块从 GitHub tag re-vendor;business 仓没有 git 仓,**不要 vendor 拷贝源码**(会像此前 9 个仓一样腐烂),统一用相对 `file:` 依赖直连 fusion-web-shell 工作区源码 —— 源码即锁,host 侧修复自动生效:

```json
{
    "dependencies": {
        "@fusion/web-sdk": "file:../../fusion-web-shell/packages/sdk",
        "@fusion/design-tokens": "file:../../fusion-web-shell/packages/design-tokens"
    }
}
```

规则:

- 路径**必须相对**(`file:../../...`),按各 app `web/` 到 fusion-web-shell 的实际层级计算。禁止绝对路径 `file:/Users/dahai/...`(charactervoice 现状,换机即坏)。
- 依赖名统一 `@fusion/web-sdk`(fit-ai 现用别名 `@fusion/sdk`,整改)。
- 每次拉新后 `bun install` 刷新;当前对应 release **v0.1.2**(含 host bridge TypeError 修复与 cached-sync 主题)。

## 4. 主题 / 语言 / HTTP 生命周期规范

三项全部经 SDK,**禁止再手写**。v0.1.2 起的正确用法:

```ts
import { createShellSdk } from '@fusion/web-sdk';

const sdk = createShellSdk();   // 嵌入 iframe 自动走 host bridge;独立 dev 自动降级

// 主题:`get()` 是同步缓存读(可能是初值),`subscribe` 才是事实来源。
// host 挂载期的首条主题 push 可能落在 about:blank 上丢失,SDK 内部已用
// 后台 pull 纠正缓存 —— 模块侧不需要、也不应该再自己拉取。
function applyTheme(mode: 'light' | 'dark') {
    document.documentElement.classList.toggle('light', mode === 'light');
    document.documentElement.classList.toggle('dark', mode === 'dark');
}
sdk.theme.subscribe(applyTheme);   // 回调挂载即视为唯一权威,首条可能晚几百 ms

// 语言:同 push 模式,host zh/en 切换自动到达
sdk.i18n.subscribe((lang) => { document.documentElement.lang = lang; });

// HTTP:一律 sdk.http(Bearer 经 host 中继,免 token 管理);
// API 用相对路径,网关处统一为 /shell/<id>/api/v1/...
const me = await sdk.http.get('/api/v1/shell/me');
```

反模式(审计中实际发现,一律清除):

- `localStorage` 存 shell 主题 + `storage` 事件同步(ai-family `web/src/theme.ts`)——iframe 各自独立 document,storage 不跨 frame,纯死代码。
- 手写 `window.addEventListener('message')` 解析 `{type:'event', event:'theme'}`(ai-family)。
- 把 `sdk.theme.get()` 包成 Promise 再 `.then`(fit-ai)——v0.1.2 起是同步缓存读。
- 裸 `fetch` 直连 API(ai-family `api.ts`)——不经 Bearer 中继,经网关一律 401。

## 5. 逐仓现状与整改清单

审计基线 2026-10-27,基于各仓当前磁盘状态。

### 达标样例(照抄即可)

**ai-hr-automation** —— 唯一接近达标的应用:相对 `file:` 依赖、SDK i18n/theme 桥、`web/manifest.json` 齐备。其余应用整改时以其 `web/src/i18n.ts`、`web/src/theme.ts`、`web/package.json` 为模板。
动作:`bun install` 刷新一次依赖即对齐 v0.1.2。

### 需整改

**ai-family** —— SPA 与 manifest 齐备,但桥接层全手写:
1. `web/src/theme.ts` 整体重写:删 localStorage/storage 事件/手写 message 监听,换成 §4 的 `sdk.theme.subscribe`。
2. `web/src/api.ts` 裸 fetch 改 `sdk.http`(Bearer 中继,API_BASE 相对路径逻辑可保留)。
3. `web/src/i18n.ts` 改 `sdk.i18n`。
4. package.json 增 `@fusion/web-sdk` 相对 `file:` 依赖。

**charactervoice** —— SDK 已接但依赖路径是绝对路径,且无 manifest:
1. `file:/Users/dahai/...` 改相对 `file:../../fusion-web-shell/packages/sdk`(按实际层级)。
2. 补 `web/manifest.json`(id `fusion-charactervoice`,category `domain`)。

**fit-ai** —— SDK 已接但别名错误、主题代码过期:
1. 依赖名 `@fusion/sdk` 改 `@fusion/web-sdk`,import 同步改。
2. `web/src/sdk.ts` 删 `Promise.resolve(sdk.theme.get())` 包装(v0.1.2 同步读),只留 `subscribe`。
3. 补 `web/manifest.json`。

**surl-school-booking-agent** —— manifest 双违规,且 `web/` 下只有 manifest 没有 SPA:
1. manifest:`id` 改 `fusion-surl-school-booking-agent`,`category: "business"` 改 `domain`(非法枚举,gateway 会拒)。
2. 按基线栈补 SPA,或明确该应用暂不出 Web 端则撤下 manifest。

**ai-speech-exam** —— 根目录 `manifest.json` 是过期旧版(`entry: "/shell/ai-speech-exam/"` 路径与 id 不一致、混入非 schema 字段 `name/port/type`),`web/` 是占位符:
1. 删根目录旧 manifest,改为 `web/manifest.json` 标准版(id `fusion-ai-speech-exam`,entry `/shell/fusion-ai-speech-exam/`)。
2. 按基线栈建 SPA。

**ai-apparelmockup / customer-insight** —— `web/` 有脚手架(src、index.html、tailwind config)但无 package.json、无 manifest:
1. 补 `web/package.json`(含 SDK 相对依赖)、`web/manifest.json`。
2. `bun install && bun run build` 验证可构建。

## 6. 验收标准

每仓整改完成 = 以下全绿,缺一不算完成:

1. `bun install && bun run build` 成功,产物为纯静态 bundle。
2. manifest 经 gateway 注册成功(`POST /api/v1/shell/manifests` 返回 200;或静态托管挂载)。
3. 在 `http://127.0.0.1:11432` 登录 shell,侧边栏出现该模块,打开 tab 页面正常渲染。
4. shell 切换深/浅主题,模块 iframe 内 UI 即时跟随;切换 zh/en,模块文案跟随。
5. 模块内 API 请求经 `sdk.http` 走通(如 `/api/v1/shell/me` 返回当前用户),无 401。
6. 代码内 grep 无手写 `postMessage` 主题/语言处理、无裸 `fetch` API 调用、无 `file:/Users/` 绝对依赖路径。

## 7. 参考资料

- 模块集成契约与常见问题:`fusion-web-shell/docs/module-integration-notes.md`(主题生命周期见其 §2)
- manifest 扩展字段:`fusion-web-shell/docs/manifest-ext-schema.md`
- manifest 基础 schema:PRD `~/fusion/architecture/fusion-union-web-prd-1015.md` §5.1
- v0.1.2 release:https://github.com/dahai80/fusion-web-shell/releases/tag/v0.1.2
- 达标代码样例:`~/fusion/business/ai-hr-automation/web/src/{theme,i18n,api}.ts`
