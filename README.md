# fusion-web-shell

Fusion unified web shell — the host of the fusion-* union web frontend.

Single entry (`fusion-gateway` :11432), unified login + RBAC, per-tab same-origin iframe modules, KeepAlive tabs, hot-pluggable manifest registry, H5 responsive.

## Status

Shell host implemented (issues #1-#7 plus PRD/UI-spec gap items):

- Host bridge wiring (TabView <-> SDK): http proxy with Bearer, toast/tab events, theme/visibility/lang push, 30s heartbeat (liveness enforced only for SDK modules that answered a ping, so non-SDK modules never false-crash)
- Refresh restore: persisted tabs rebuild after manifests load; interrupted streaming tasks marked retryable (PRD §6.1)
- Gateway error envelope `{code,message,module_id,retryable}`: retryable/5xx raises a toast + transient error strip on the active tab (A5)
- Bilingual chrome (menu/tabs/login) via `t()` with `title_en` support and a language toggle
- Desktop TabStrip: crashed/interrupted/error badges + close confirmation for tabs with active tasks; mobile drawer tabs are closeable
- Sidebar "+" opens a second instance of an open module; manifest loads auto-retry with backoff ("retry attempt N"); /admin/users route is lazy-loaded
- Dev server port 11430 (complies with the repo-wide 11400-11499 rule, registered in `architecture/port-registry.yaml`)

Gateway-side APIs (session, RBAC, manifest registry, static hosting) live in `fusion-gateway` per PRD R-1 and are required for end-to-end runs.

## Host GUI Upgrade (issue #24, fusion-all-gui-1020 §5)

- **⌘K command palette (G4/C1)** — global overlay (`⌘K` / `Ctrl+K`), three aggregated sources: navigation (modules + sub-page deep links), quick actions (new workflow / run graph / load model, only for granted modules), and cross-module search via manifest `searchProviders` (`GET <endpoint>?q=<query>` → `{items:[{title, route?}]}`, debounced, per-provider failure isolation).
- **@fusion/design-tokens (G5/C7)** — single-source palette/spacing/radius/typography (dark + light) published as a workspace package (`packages/design-tokens`); `@fusion/web-ui` re-exports its tokens.css and Tailwind preset. Module-private theme values are deprecated — vendor-sync this package instead.
- **Notification center (G11/C3)** — bell in the sidebar (and mobile drawer) aggregating approvals / run terminal states / engine events from manifest `notifications` sources, polled over the existing gateway surface (no new backend). Persisted read set; item click deep-links into the module tab.
- **Deep links + sub-page IA (C8)** — the single deep-link form is `/shell/<id>/?embedded=1#/<route>` (tab src = `${entry}#${route}`). Declare module sub-pages via manifest `pages` (`{route, title, title_en?}`) to make them reachable from the shell menu and palette; same-route re-open activates the tab without reloading (KeepAlive preserved).

Manifest schema v1 ext (all optional, sanitized on load; gateway pass-through of these fields is tracked upstream):

```json
{
    "searchProviders": [{ "id": "workflows", "label": "工作流", "label_en": "Workflows", "endpoint": "/api/cowork/search" }],
    "pages": [{ "route": "/runs", "title": "运行", "title_en": "Runs" }],
    "notifications": [{ "id": "approvals", "label": "审批", "endpoint": "/api/cowork/approvals?status=pending", "kind": "approvals" }]
}
```

`notifications[].kind` is one of `approvals | runs | engine`; polled responses are `{items: [{id, title, route?, level?, ts?}]}` with `level` one of `info | warning | error`.

Full schema addendum with copy-paste manifest example and both-sides validation vocabulary: [`docs/manifest-ext-schema.md`](docs/manifest-ext-schema.md) (#26).

## Home (issue #32)

Home is the default landing when no tab is active: time-of-day greeting, status strip (engine `fusion-mlx` / resident node `fusion-multi-node` online dots + global model selector placeholder), delegation message box, suggested task chips, and running / recently completed / scheduled task sections (empty states until the aggregation API ships). The sidebar gains a `⌂ 首页` entry and mobile BottomNav a Home slot; both clear the active tab pointer (KeepAlive tabs stay mounted).

Modules contribute Home cards via the manifest `home` section (gateway pass-through: fusion-gateway#264):

```json
{
    "home": {
        "cards": [{ "id": "monthly-close", "title": "月度对账", "title_en": "Monthly close", "route": "/workflows/monthly-close", "chip": true }]
    }
}
```

`chip: true` cards surface as suggested chips: click = prefill the message box + deep-link `${entry}#${route}` into the module. Unreachable modules render greyed (offline-safe).

## Home task feed + inline approvals (issue #33)

Modules declare a `notifications` source with `kind: "tasks"` (poll contract in [`docs/manifest-ext-schema.md`](docs/manifest-ext-schema.md)); the shell polls it every 30s alongside the bell (tasks sources are excluded from the bell) and buckets items into running / recently completed / scheduled Home sections. Tasks carrying `pending_approval: {endpoint, prompt?, risk?}` render a three-action approval card (reject / allow once / always allow) — the decision `POST`s `{id, action}` to the module endpoint without opening the tab. Per-source failure isolation: a broken source keeps its last good snapshot, so offline task state stays readable. Card click deep-links `${entry}#${route}` into the owning module.

- PRD: `~/fusion/architecture/fusion-union-web-prd-1015.md`
- UI Spec: `~/fusion/architecture/fusion-web-ui-spec-1015.md`

## Development

Requires Bun >= 1.1.

```bash
bun install
bun run dev         # shell dev server on :11430, /api proxied to gateway :11432
bun run build       # typecheck + build all workspaces
bun run test        # bun test across packages
bun run lint        # biome check
bun run typecheck   # tsc across workspaces
```

Dev HMR for module iframes: `VITE_SHELL_ENV=dev FUSION_DEV_MODULES=<id>:<port> bun run dev` overrides the matching module's iframe src to the local Vite server.

CI gates: lint + typecheck + test + build on every PR (`.github/workflows/ci.yml`).

## Publish (gateway same-origin hosting)

`fusion-gateway` hosts the shell SPA same-origin at its root when `web_shell.spa_dir` is configured (gateway v0.9.46, `/#247`): `"/"` catch-all with `index.html` fallback below every API namespace, `index.html` served `no-store`, `assets/*` immutable-cached with vite hash naming.

```bash
bun run publish        # build apps/shell + verify + sync to ~/.fusion-gateway/shell-spa
# custom target: FUSION_SHELL_SPA_DIR=/some/dir bun run publish
```

The script fails visibly if `index.html` carries relative asset paths or hashed assets are missing. Pair the gateway config:

```yaml
web_shell:
    spa_dir: ~/.fusion-gateway/shell-spa
```

The SPA route is unauthenticated by design — the first screen stays the shell login (see issue #23).

## Monorepo Layout (Bun workspaces)

```
apps/shell        # Host shell: React 18 + Vite + TS + Tailwind + Zustand
                  #   Tab Manager (KeepAlive via display:none), per-tab same-origin
                  #   iframe loader (/shell/<id>/), manifest client, host
                  #   ErrorBoundary, unified HTTP client, dev HMR switch,
                  #   ⌘K command palette, notification center,
                  #   desktop sidebar / mobile bottom-nav dual layout
packages/design-tokens # @fusion/design-tokens — single-source design tokens
                  #   (palette/spacing/radius/type, dark+light): TS + CSS vars
                  #   + generated Tailwind preset
packages/sdk      # @fusion/web-sdk — postMessage bridge client:
                  #   http proxy (host token), toast, tab API, theme, devices probe
packages/ui       # @fusion/web-ui — re-exports @fusion/design-tokens tokens/preset,
                  #   shared components (StatusBadge, LogStream, MetricChart,
                  #   DataTable, TaskProgress, EmptyState/ErrorState/Skeleton),
                  #   formatters, H5 responsive primitives
docs/             # Architecture notes, ADRs
```

## Module Integration (any fusion-* module)

1. Provide `web/manifest.json` (schema: PRD §5.1) in your repo
2. Build a plain static SPA bundle; `fusion-gateway` serves it at `/shell/<id>/`
3. Optionally depend on `@fusion/web-sdk` (+ `@fusion/web-ui`) for host APIs and shared components
4. Dev mode: point `FUSION_DEV_MODULES=<id>:<port>` at your Vite dev server for HMR

New module UIs must use the baseline stack (React 18 + Vite + TS + Tailwind + Bun) — see UI Spec §10.1. Existing frontends may integrate with their current stack during the transition period and must migrate before P3 close-out.

## License

See LICENSE.
