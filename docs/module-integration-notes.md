# Module integration notes — running inside the shell iframe

Answers to the recurring integration questions (collected from issue #67,
EnviPermit onboarding). Manifest field reference lives in
`docs/manifest-ext-schema.md`; the bridge contract is `packages/sdk/src/types.ts`.

## 1. Any module repo, `fusion-` manifest id

The registry keys off the manifest `id`, not the repo name — but gateway
validation requires that id to carry the `fusion-` prefix
(`internal/shell/manifest.go` rejects anything else with
`manifest id "<id>" must use the fusion-<name> prefix`). A repo named
`envipermit` therefore registers as `id: "fusion-envipermit"`:

1. Ship `web/manifest.json` (base schema PRD §5.1; ext fields optional),
   `id` = `fusion-<name>`.
2. Register at `POST /api/v1/shell/manifests` (or ship via the gateway's
   static hosting at `/shell/<id>/`). `category` must be one of
   `platform|domain|infra|dev`.
3. Dev mode: `FUSION_DEV_MODULES=fusion-envipermit:<vite-port>` for HMR.

Recommended fields for a domain module like EnviPermit:

- `title` / `title_en`, `icon` — sidebar/menu/palette copy
- `category: "domain"`, `devices: ["desktop"]`
- `pages` — declare `/projects`, `/rules`, `/kb`, `/settings` so they are
  reachable from the shell menu and ⌘K palette (deep-link form
  `/shell/<id>/?embedded=1#/<route>`)
- `notifications` — one poll source per feed (approvals / runs / engine /
  tasks `kind`s); the bell deep-links items into your tab
- `permissions_policy: ["microphone"]` — only if the module uses
  getUserMedia (issue #66)

Visibility is not a manifest field: a module is hidden until an operator
grants it per user (admin UI, issue #65). No required-role field exists —
gate inside the module using the user/roles read below.

## 2. What the postMessage bridge supports

`@fusion/web-sdk` (`createShellSdk()`) exposes: `http` (Bearer-relayed via
the host), `toast`, `tab.setActiveTask`, `theme`, `devices`, `visibility`,
`i18n`. Specifically:

- **Current user/roles**: no dedicated getter; call
  `sdk.http.get('/api/v1/shell/me')` — the host attaches the shell Bearer
  token, response includes `user_id`, `roles`, `permissions`.
- **Notification-center emits**: not postMessage-push. Declare manifest
  `notifications` poll sources; the host polls your gateway-absolute
  endpoint and aggregates into the bell. Items deep-link via `route`.
- **Gateway-pending degradation states**: host-side only (pendingSurfaces
  guard). A module whose backend route is not shipped yet should degrade
  internally from its own API responses; the shell surfaces pending state
  only for shell-owned admin surfaces.

## 3. SSE inside shell iframe tabs

- The iframe sandbox (`allow-scripts allow-same-origin allow-forms
  allow-downloads`) does not restrict EventSource/fetch streaming — SSE
  works same-origin through the gateway.
- **`EventSource` cannot send an `Authorization` header**, and shell auth is
  Bearer-only (no session cookie). For a Bearer-gated SSE endpoint, mint a
  short-lived token from your own API (called via `sdk.http`) and pass it as
  a query parameter, or fall back to `sdk.http` polling.
- The dev gateway speaks HTTP/1.1, where browsers cap ~6 concurrent
  connections per origin — every held-open SSE stream counts against all
  tabs' traffic to `:11432`. Keep one stream per module (multiplex job
  progress over it) or poll; KeepAlive rehydration after tab switches
  should reconnect with `Last-Event-ID`.
