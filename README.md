---
doc_id: fusion-web-shell/readme
product: fusion-web-shell
class: platform
entry: service
doc_type: readme
title: { zh: "fusion-web-shell 说明", en: "fusion-web-shell readme" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: @dahai
source_of_truth:
    - README.md
---

# fusion-web-shell

Fusion unified web shell — the host of the fusion-* union web frontend.

Single entry (`fusion-gateway` :11432), unified login + RBAC, per-tab same-origin iframe modules, KeepAlive tabs, hot-pluggable manifest registry, H5 responsive.

## Unified auth portal (issues #125/#126)

Per `architecture/fusion-site-auth-1104.md` decision 4, registration/login is ONE portal app served by the gateway at `/auth` — site and shell redirect to it and return via one-time code handoff; no per-client auth forms.

- **`apps/auth` (`@fusion/auth`)** — the portal: React 18 + Vite + TS + Tailwind, Apple black/white refined tokens (white bg, `#1d1d1f` ink, `#d2d2d7` hairlines, black pill buttons). Four channels on one screen: login, personal signup (A), tenant signup (B, free plan binding note), join tenant (C — invite code redemption or join request per the tenant's `join_policy`). Email verification states (pending / verified / resend) render once a token pair exists. Fully bilingual with a manual toggle.
- **Handoff (live, gateway #506)**: after a successful auth call the portal mints a one-time code (`POST /auth/api/code`, 60s TTL single-use, origin allowlist-bound — §8) and redirects to the allowlisted `redirect` URL; the shell spends it at `POST /auth/api/code/exchange` (`{code, redirect_uri}` → token pair). Shell origins must be listed in the gateway `auth_portal.redirect_uris` allowlist.
- **Shell consumption (#126)**: on 401 the shell probes `HEAD /auth` and redirects there with a safe return path; on return, `?code=` is exchanged (`POST /api/auth/exchange`, gateway #506 contract) for the session before normal restore. The login page links to the portal with a probe — until the backend lands, the local form stays the honest fallback.
- **Degradation** — the registration endpoints are upstream-pending (fusion-identity #39/#40, gateway auth routing #506): portal API calls that 404/501 show a bilingual backend-pending notice instead of raw errors; the shell keeps the local session flow.

## Cloud-try real product experience (issue #130, Phase 2)

Per `architecture/fusion-cloud-try-real-product-1104.md`: the cloud experience is real product usage — a user logged in on fusion-site (fusion-identity) reaches the cowork web GUI hosted by this shell without a second login, constrained only by a daily token quota metered at the gateway (gateway #514).

- **SSO ticket handoff** — fusion-site appends a short-lived one-time ticket (issued by fusion-identity) to the workbench URL (`https://<shell>/...?ticket=<one-time>`). The shell consumes and strips `?ticket=`, exchanges it at `POST /api/v1/shell/session/sso` (`{ticket}` → `{token, identity_token?, username?, roles?}`) before normal session restore, and stores the returned identity JWT separately (`sessionStorage['fusion.identity.token']`). Until the gateway ships the route (upstream issue pending), the exchange 404/501-degrades to the existing local/portal login flows.
- **Identity JWT propagation** — modules read the session's identity JWT via the SDK (`sdk.auth.identityToken()`, bridge method `identity-token`; null on local sessions or older hosts) and attach it to their LLM calls so the gateway metering middleware keys the daily quota by the user's `sub`.
- **Quota-aware UX** — a module LLM call answered `429 {"detail": "daily token quota exceeded", "quota": {...}}` surfaces as a friendly bilingual notice ("今日 Token 额度已用完，明天自动恢复 / Daily token quota exceeded — resets tomorrow") as a toast + transient tab strip, never a raw error; the SDK classifies it (`isQuotaExceededError`) and never retries it.
- **VPS deployment profile** — deploy the shell (via gateway :11432) plus cowork web backend on the VPS; modules point their LLM base URL at the gateway metering endpoint (never a direct MLX address, per the ecosystem rule that all downstream traffic crosses the gateway). Bridge http proxying and the 401/403/429 handling above are profile-agnostic — no code switch needed.

## Status

Shell host implemented (issues #1-#7 plus PRD/UI-spec gap items):

- Host bridge wiring (TabView ↔ SDK): http proxy with Bearer, toast/tab events, theme/visibility/lang push, 30s heartbeat (liveness enforced only for SDK modules that answered a ping, so non-SDK modules never false-crash)
- Refresh restore: persisted tabs rebuild after manifests load; interrupted streaming tasks marked retryable (PRD §6.1)
- Gateway error envelope `{code,message,module_id,retryable}`: retryable/5xx raises a toast + transient error strip on the active tab (A5)
- Bilingual chrome (menu/tabs/login) via `t()` with `title_en` support and a language toggle
- Desktop TabStrip: crashed/interrupted/error badges + close confirmation for tabs with active tasks; mobile drawer tabs are closeable
- Sidebar "+" opens a second instance of an open module; manifest loads auto-retry with backoff ("retry attempt N"); /users route is lazy-loaded
- Two-level sidebar (issue #46): level 1 = product accordion row (click opens its default page), level 2 = its manifest `pages` expanded one at a time; the active product auto-expands on tab focus; mobile drawer renders the same nested tree
- Four-section menu taxonomy (issue #99, MT-1/MT-2/MT-3): fixed sidebar sections Core → Governance → Domain → Platform (shell-side `sectionOf` pins product lines core-ward until gateway #455 emits the extended enum), 11px uppercase section headers, 32px rows with a curated 16px lucide icon, three-state status dots (green healthy / amber unread run·task·engine events / gray offline, tooltip labelled), per-module unread count bubbles, and persisted section collapse (domain starts collapsed); offline dots carry a diagnose tooltip (start hint via `fusion-sv` + relative last-online time from the persisted last-seen registry, issue #112)
- Visibility = registration + RBAC (issue #100, MT-D): heartbeat-expired modules keep their menu entry with a gray dot and open a graceful module-unavailable page (retry re-probes gateway health and remounts on recovery) instead of disappearing; ⌘K nav indexes unreachable granted modules too
- Honest degradation (issue #46): a 404/501 on a not-yet-shipped gateway surface (adapters/connectors/roles/menu-permissions/audit/config) marks it pending for the session (sessionStorage) — one muted badge, no repeat requests; notification sources answering 502/503 mark their module unreachable, stopping the 30s poll loop against stale registrations
- Dev server port 11430 (complies with the repo-wide 11400-11499 rule, registered in `architecture/port-registry.yaml`)

Gateway-side APIs (session, RBAC, manifest registry, static hosting) live in `fusion-gateway` per PRD R-1 and are required for end-to-end runs.

## Host GUI Upgrade (issue #24, fusion-all-gui-1020 §5)

- **⌘K command palette (G4/C1)** — global overlay (`⌘K` / `Ctrl+K`), three aggregated sources: navigation (modules + sub-page deep links), quick actions (new workflow / run graph / load model, only for granted modules), and cross-module search via manifest `searchProviders` (`GET <endpoint>?q=<query>` → `{items:[{title, route?}]}`, debounced, per-provider failure isolation).
- **@fusion/design-tokens (G5/C7)** — single-source palette/spacing/radius/typography (dark + light) published as a workspace package (`packages/design-tokens`); `@fusion/web-ui` re-exports its tokens.css and Tailwind preset. Module-private theme values are deprecated — vendor-sync this package instead.
- **Interaction-layer contract (#56)** — the tokens additionally pin the interaction layer: a z-index ladder (`z-base 0 < z-dropdown 50 < z-overlay 60 < z-toast 70`, consumed as Tailwind `z-dropdown`/`z-overlay`/`z-toast`), elevation tiers (`fs-elev-1` = dropdown/popover shadow, `fs-elev-2` = modal shadow — plain CSS classes from `@fusion/web-ui`), and button levels (`fs-btn` + `fs-btn-primary`/`-secondary`/`-ghost`/`-danger`, one radius token + one padding step, `text-xs`/`px-2 py-1` utilities may downsize). Toast renders above every overlay (z-toast); the notification dropdown, composer popover and command palette/dialogs all use the tiers.
- **Notification center (G11/C3)** — bell in the sidebar (and mobile drawer) aggregating approvals / run terminal states / engine events from manifest `notifications` sources, polled over the existing gateway surface (no new backend). Persisted read set; item click deep-links into the module tab.
- **Deep links + sub-page IA (C8)** — the single deep-link form is `/shell/<id>/?embedded=1#/<route>` (tab src = `${entry}#${route}`). Declare module sub-pages via manifest `pages` (`{route, title, title_en?}`) to make them reachable from the shell menu and palette; same-route re-open activates the tab without reloading (KeepAlive preserved).

Manifest schema v1 ext (all optional, sanitized on load; gateway pass-through of these fields is tracked upstream):

```json
{
    "searchProviders": [{ "id": "workflows", "label": "工作流", "label_en": "Workflows", "endpoint": "/api/cowork/search" }],
    "pages": [{ "route": "/runs", "title": "运行", "title_en": "Runs" }],
    "notifications": [{ "id": "approvals", "label": "审批", "endpoint": "/api/cowork/approvals?status=pending", "kind": "approvals" }],
    "permissions_policy": ["microphone", "camera"],
    "group": "fusion-office", "group_title": "Office 套件", "group_title_en": "Office Suite", "sort": 2
}
```

`notifications[].kind` is one of `approvals | runs | engine`; polled responses are `{items: [{id, title, route?, level?, ts?}]}` with `level` one of `info | warning | error`.

`permissions_policy` (issue #66) delegates iframe Permissions-Policy features — tokens restricted to `microphone | camera`, each scoped to the frame's own origin (`allow="microphone 'src'"`). AV modules need it for `getUserMedia` inside the shell iframe; absent field = no `allow` attribute, existing modules unchanged.

Module onboarding (any repo, user/roles read, SSE-in-iframe constraints): `docs/module-integration-notes.md`.

`group` (issue #71) collapses sibling apps into one two-level sidebar menu (per-group expand state persisted; RBAC stays per-module; groups get no mobile bottom-nav slot). Gateway pass-through landed in fusion-gateway#298 (issue #297) — re-registering a manifest with the fields is enough to light the menu up. The group row carries an aggregate status dot with priority healthy > events > offline (issue #104).

Full schema addendum with copy-paste manifest example and both-sides validation vocabulary: [`docs/manifest-ext-schema.md`](docs/manifest-ext-schema.md) (#26).

## Home (issue #32)

Home is the default landing when no tab is active: time-of-day greeting, status strip (engine `fusion-mlx` / resident node `fusion-multi-node` online dots), delegation message box, suggested task chips, and running / recently completed / scheduled task sections (empty states until the aggregation API ships). The sidebar gains a `⌂ 首页` entry and mobile BottomNav a Home slot; both clear the active tab pointer (KeepAlive tabs stay mounted).

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

Modules declare a `notifications` source with `kind: "tasks"` (poll contract in [`docs/manifest-ext-schema.md`](docs/manifest-ext-schema.md)); the shell polls it every 30s alongside the bell (tasks sources are excluded from the bell) and buckets items into running / recently completed / scheduled Home sections. Tasks carrying `pending_approval: {endpoint, prompt?, risk?}` render a three-action approval card (reject / allow once / always allow) — the decision `POST`s `{id, action}` to the module endpoint without opening the tab. Per-source failure isolation: a broken source keeps its last good snapshot, so offline task state stays readable. Card click deep-links `${entry}#${route}` into the owning module. Tasks may carry `space` (+ optional `space_route`) — the owning space/project renders as a chip that deep-links into the space view (issue #41).

## Home projects/spaces section (issue #41)

The organization dimension: modules declare their spaces/projects via a manifest `home.projects` poll source (gateway pass-through: fusion-gateway#274). The shell polls each source every 60s and renders a "项目 / 空间" section below the task feed, grouped by module and greyed when the module is unreachable; each entry deep-links `${entry}#${route}` into the module's space view. Poll contract: `GET ${endpoint}` returns `{"items": [{id, title, route, description?, updated_at?}]}` — items without a valid `route` are dropped. The section stays hidden until a module declares `home.projects`; per-source failure isolation matches the task feed.

## Delegation entry + global model selector (issue #34)

The Home message box is a shell-level delegation entry with phase-1 rule routing (never silent — the decision and reason render under the box):

- **Questions** → shell-level chat: `POST /api/v1/shell/chat/completions` (session-gated LLM proxy, fusion-gateway#268) with the persisted global model; the thread renders on Home.
- **Task-flavored prompts** → deep-link into the owning module with the prompt prefilled: cowork `/workflows?new=1&prompt=<encoded>` (task verbs), agent-studio `/canvas?run=1&prompt=<encoded>` (orchestration/agent keywords).
- **Audit**: every delegation appends `{ts, prompt, route, reason}` to `fusion.shell.delegations` (capped 50).
- **Global model/effort selector** lives in the Home composer's ⚙ params popup only (options from the session-gated `GET /api/v1/shell/models` gateway catalog, fusion-gateway#443 — local, cloud and alias entries with curation rules; per-backend duplicates collapse client-side pending fusion-gateway#447; the duplicate status-strip selects were removed in #59, the engine-loaded `/v1/models` source in #94). Persisted at shell level; **module handoff contract**: module iframes are same-origin, so cowork delegate / agent-studio Composer converge their per-module model keys onto reading `localStorage["fusion.shell.model"]` / `["fusion.shell.effort"]` (`''`/`default` = gateway routing default).
- **Artifact tools in chat (issue #106, A-14)**: every chat turn sends the four Artifacts tools (`create/update/get/list_artifact`, `lib/chatTools.ts`) and runs a client-side tool loop — returned `tool_calls` execute against the gateway module proxy (`/shell/fusion-artifacts/api/v1/...`, upstream service key injected by the gateway, never the engine port) and feed back as tool messages until the model answers in plain text (round cap 4; the last round drops tools so it must settle). Grounding guard: an assistant text claiming artifact creation with no successful artifact tool call gets a deterministic system correction appended — no phantom success.
- Phase 2 (model-based classification with manual override chips) is deferred; the rule layer is a single pure function (`routeDelegation`) ready to swap.

Since issue #50 the message box is a full composer; since #55 it renders the **shared `Composer` from `@fusion/web-ui`**, retooled to **FCS-1 (Fusion Composer Standard, `architecture/fusion-composer-standard-1101.md`, adopted into the S-series spec as §7.4/S15 — web-shell#96)**. Five-zone anatomy: ① optional context-chip bar ② attachment chips ③ borderless auto-grow textarea (1→8 rows) ④ tool row — bottom-left input enhancement (`📎` attach → `🖼` image → `＠` reference palette, fixed order; a leading `/` opens the command palette), bottom-right execution (`⚙` params popup with model/effort — every tunable lives there, no loose toolbar buttons — then send, always rightmost) ⑤ persistent hint row (`Enter 发送 · Shift+Enter 换行`, appending `· Esc 停止` while generating). Send is icon-only ⬆ 36×36 rounded-xl indigo with three states — empty disabled / content enabled / **generating becomes ⏹ stop** (Esc equivalent; the Home pill keeps one fixed "发送" label, label switching is forbidden). Shortcuts: Enter send, Shift+Enter newline, Esc stop-when-busy, ⌘V image → attachment chip (multimodal surfaces). Container tokens: rounded-2xl, zinc-200/80 border (dark zinc-700/60), focus-within 2px indigo-500/30 ring. Home wires the `/` palette to the static prefill chips and the `＠` palette to the delegation targets' manifest pages (`lib/composerCapabilities.ts`); suggestion chips stay attached under the box (static chips prefill the textarea; module-declared chips keep their deep link, dimmed when unreachable). `Composer` props: `value/onChange/onSubmit`, optional `onStop`, `placeholder`, `contextChips`, `attachments`/`onRemoveAttachment`, `attach`, `images`, `references`, `slashCommands`, `params` (`{model, effort, actions}`), `hint` (or `false`), `stopHint`, `busy/disabled`, `sendVariant` (`icon`|`pill`), `sendLabel`, `stopLabel`. Chat replies render through the shared **`ChatThread`** (user right `bg-muted` 16/16/4/16 max-w 82%, agent left bordered 4/16/16/16 max-w 88%, streaming agent bodies via `StreamingMarkdown`, error block on the error token). Issue #57's output contract is unchanged: tool-call `steps` (⚡/◇ + duration), scrollable `step-data` lists, `citations`/`artifacts`, and the `state` lifecycle `pending`/`streaming`/`done`/`failed`. Module-side FCS-1 conformance (agent-studio FC-1, cowork FC-2) is tracked in the upstream repos.

## Settings: API keys (issue #35)

`/settings` (sidebar `⚙ Settings`): manage gateway user keys (`fk-` credentials for scripts/CI) through the session-gated admin surface `GET/POST /api/v1/shell/keys`, `POST /api/v1/shell/keys/{name}/rotate`, `DELETE /api/v1/shell/keys/{name}` (fusion-gateway#272; the master-gated `/api/v1/keys` control plane stays as-is — the master key never reaches a browser).

- **Create** — key name + scope matrix driven by registered manifests (`<module>:read|write|execute`, all unchecked by default). The plaintext (`raw_key`) is revealed exactly once in a copy dialog (never logged, never persisted client-side); the list surface only carries the `fk-…tail4` prefix.
- **Rotate** — confirmation notes the dual-active grace window for the old key; the new plaintext uses the same one-time reveal.
- **Revoke** — confirmation with the key name; soft-revoked server-side (row kept for audit), shown with a status badge.
- **Usage** — per key: scopes, created/updated dates, quota when configured.
- **Degradation** — until the gateway ships the session-gated key surface (fusion-gateway#271) the page shows a gateway-pending notice instead of an error wall; it becomes fully usable the moment the endpoint exists.

## Settings: model policy (issue #114)

`/settings` also hosts the model-policy plane (gateway contract: fusion-gateway#486). Approved chain: module override > user preference (allowlist-constrained) > tenant global default > build-time fallback.

- **Admin** (`admin` role or `*` permission): tenant default model, per-module overrides for manifests declaring `model_capable` (with the module's `suggested_model` shown as a hint), user allowlist, and the `privacy_mode` toggle (`all` / `local-only`, which hides cloud models). Saving hot-applies: a shell-level `fusion:model-policy` event is bridged into every open module tab (`model-policy` push), invalidating SDK-side model caches.
- **Non-admin**: read-only view of the effective policy (tenant default, privacy mode) plus a personal preference picker constrained by the allowlist and privacy mode.
- **SDK**: `sdk.model.get(moduleId?)` resolves the effective model through the host (gateway preference endpoint with the host token; local chain fallback) with per-module caching invalidated by the policy push; `sdk.model.subscribe(listener)` observes changes. `sdk.model.env(moduleId?)` (issue #118) returns the full `ShellModelInfo` — module-declared `modelCapable`/`suggestedModel`, platform-resolved `platformModel`, `privacyMode` and `allowlist` (the last two undefined while the gateway policy API is pending).
- **Manifest schema v3 fields**: `model_capable: bool`, `suggested_model: string` — optional pass-through, older manifests keep working.
- **Chat**: shell chat resolves its model through the same chain (sync local read; no suspension before abort wiring).
- **Degradation** — until the gateway ships `GET/PUT /api/v1/model-policy` + `GET /api/v1/model-preference` (fusion-gateway#486) the section shows a gateway-pending notice, pickers stay unconstrained, and resolution falls back to the user preference layer only.

## Sidebar: three-state product catalog (issue #116)

The sidebar keeps the whole product line browsable (gateway contract: fusion-gateway#488). Each catalog entry resolves to one of three states: **running** (registered + healthy), **stopped** (registered but unreachable) and **not-installed** (catalog-only).

- **Not-installed rows** render dimmed with a dashed border inside their taxonomy section (same four-section layout), sorted after the installed entries; they never render as tabs. Clicking one opens the item panel: bilingual description, footprint, model requirement, dependencies and a copyable `fusion install <id>` handoff command.
- **Running / stopped** rows stay the manifest-driven entries — the catalog merge never duplicates them.
- **Degradation** — if the catalog API is unreachable from the browser session (404/501, or 401/403 while the shell-session alias was pending, fusion-gateway#504) the store pins `gatewayPending` and the sidebar renders exactly as before (manifest-only). One-click start for stopped items is blocked on a supervisor HTTP start API; the #112 offline tooltip carries the `fusion-sv` hint meanwhile. Gateway field mapping: `title_en`/`title_cn`, `description_en`/`description_cn`, `repo` and `model_class` are accepted alongside the shell-native `title`/`description` shapes (zh display falls back title → title_cn → title_en).

## Migration E6: platform settings, users & roles, audit (issue #42)

Host pages migrated from f-ecommerce (settings/users/audit) with the same layout and interactions, generalized and rendered with the shell design tokens. Backend contracts live in [`docs/f-ecommerce-migration-e6.md`](docs/f-ecommerce-migration-e6.md); until the gateway ships a surface its section degrades to a gateway-pending notice. Since issue #51 these pages render inside the shell layout (sidebar + tab strip stay; deep links `/settings`, `/users`, `/audit` keep working via SPA pushState — `lib/adminRoute.ts`), and any tab/home interaction leaves the admin view while the KeepAlive tab area stays mounted.

- **Settings** (`/settings`, admin): self-serve API keys (scope matrix, one-time plaintext reveal, rotate/revoke). The f-ecommerce migration sections (Platform Adapters / Third-Party Connectors / Policy Overrides) were removed from the shell — platform credential/connector management belongs in the e-commerce module's own settings (transfer memo: `~/fusion/business/ai-ecommerce/docs/shell-settings-transfer-1102.md`; the gateway surfaces `/api/v1/shell/adapters|connectors|config` remain for it).
- **Users** (`/users`, admin): three tabs — the existing Users CRUD/grants, plus Roles (builtin fixed, custom roles grant write classes) and Menu Permissions (role ↔ menu matrix editor with add-menu / reset-to-defaults), backed by the E5 identity contract (fusion-identity#12).
- **Audit** (`/audit`, admin/auditor, sidebar ☰ entry): read-only hash-chained trail with user/class filters; `tampered` rows mark log modification outside the system.

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
bun run check       # typecheck + lint + build + test (full gate)
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
                  #   formatters (`formatRelativeTime` takes an optional locale, zh-CN default — issue #107), H5 responsive primitives
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
