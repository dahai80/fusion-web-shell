# Manifest ext fields — schema v1 addendum (PRD §5.1)

Addendum to the module manifest schema for the shell host features shipped in
fusion-web-shell#24 (⌘K command palette, notification center, sub-page deep
links) and fusion-web-shell#32/#33 (Home page cards, task feed). Gateway
pass-through landed in fusion-gateway#252 and fusion-gateway#264; this
document is the copy-paste reference for module repos declaring the fields.

## Where the fields live

Ext fields ride on the existing module manifest — the same JSON you already
register at `POST /api/v1/shell/manifests` (or ship as `web/manifest.json`,
PRD §5.1). Nothing about the base schema changes; the three arrays are
optional, absent = feature starved for that module.

## searchProviders — ⌘K cross-module search

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Provider key, unique within the module |
| `label` | string | yes | zh label shown in palette hints |
| `label_en` | string | no | en label |
| `endpoint` | string | yes | Gateway-absolute `/...` path of the search API |

Search contract (host side): `GET ${endpoint}?q=<query>` returns
`{"items": [{"title": "...", "route": "/..."}]}`. `route` is optional — when
present the palette deep-links `${entry}#${route}`; when absent, the command
opens the module home tab. The host debounces 250ms, times out at 5s, slices
8 items per provider, and isolates per-provider failures (a broken provider
never breaks the palette).

## pages — sub-page deep links

| Field | Type | Required | Description |
|---|---|---|---|
| `route` | string | yes | Module-relative `/...` path, must not contain `#` |
| `title` | string | yes | zh page title |
| `title_en` | string | no | en page title |

Deep-link form (single form, shell#24): tab src becomes `${entry}#${route}`.
The host lists pages as sub-entries under the module in the sidebar, mobile
drawer, and ⌘K navigation.

## notifications — notification center poll sources

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | fully consumed | Source key, unique within the module |
| `label` | string | yes | zh label shown in the bell panel |
| `label_en` | string | no | en label |
| `endpoint` | string | yes | Gateway-absolute `/...` path of the poll API |
| `kind` | string | yes | One of `approvals`, `runs`, `engine`, `tasks` |

Poll contract (host side): `GET ${endpoint}` returns
`{"items": [{...}]}` with per-item fields:

| Item field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Item id, unique within the source |
| `title` | string | yes | Rendered text |
| `route` | string | no | Module-relative `/...`; present → item deep-links into the module |
| `level` | string | no | `info` (default) / `warning` / `error` |
| `ts` | string | no | Timestamp, rendered as-is |

The host composes the stable read-set key as
`${moduleId}:${sourceId}:${itemId}` — item ids must be stable across polls
(not a fresh UUID per response), otherwise every poll re-fires as unread.
The host polls every 30s, drops items with missing `id`/`title`, caps 32
items per source, and isolates per-source failures.

## home — Home page cards (shell#32)

`home` is an optional object (not an array) contributing cards to the shell
Home landing:

| Field | Type | Required | Description |
|---|---|---|---|
| `home.cards[].id` | string | yes | Card key, unique within the module |
| `home.cards[].title` | string | yes | zh card title |
| `home.cards[].title_en` | string | no | en card title |
| `home.cards[].description` | string | no | zh one-line description |
| `home.cards[].description_en` | string | no | en one-line description |
| `home.cards[].route` | string | yes | Module-relative `/...` deep link, must not contain `#` |
| `home.cards[].chip` | boolean | no | `true` = also surface as a suggested chip under the Home message box |

Cards with `chip: true` render as suggested chips; clicking one prefills the
Home message box and deep-links `${entry}#${route}` into the module. Absent
`home` = no contribution.

## kind: tasks — Home task feed + inline approvals (shell#33)

A `notifications` source with `kind: "tasks"` feeds the Home running /
recently completed / scheduled sections instead of the bell. Poll contract:
`GET ${endpoint}` returns `{"items": [...]}` with per-item fields:

| Item field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Stable item id (not a fresh UUID per poll) |
| `title` | string | yes | Card title |
| `status` | string | no | Module vocabulary; host buckets: `scheduled` → scheduled; `done/succeeded/failed/error/cancelled/completed` → recent; everything else → running |
| `progress` | number | no | 0-100, clamped; renders a progress bar |
| `pending_approval` | object | no | `{endpoint, prompt?, risk?}` — renders the three-action approval card |
| `artifacts` | number | no | Artifact count badge |
| `updated_at` | string | no | Rendered as-is |
| `route` | string | no | Module-relative `/...`; card click deep-links into the module |

Approval wire contract: the host `POST`s to `pending_approval.endpoint` with
`{"id": <item id>, "action": "reject" | "allow_once" | "always_allow"}`; any
2xx removes the card, an error keeps it. The endpoint is
gateway-absolute and must answer same-origin through the gateway.
Per-source failure isolation: a broken source keeps its last good snapshot
(offline tasks stay readable), and never breaks the rest of the feed.

## Validation (both sides)

Gateway validates at registration (fusion-gateway#252), the shell host
re-sanitizes on load — modules must satisfy the strictest of the two:

- Endpoints and page routes: gateway-absolute `/...`, no `..` traversal.
- Page routes and home card routes must not contain `#` (the deep-link form is `#${route}`).
- `kind` is restricted to `approvals|runs|engine|tasks`.
- Each ext array caps at 32 entries (`home.cards` included).

## Copy-paste example

`web/manifest.json` (registered via `POST /api/v1/shell/manifests`):

```json
{
  "id": "fusion-cowork",
  "title": "cowork",
  "path": "/shell/fusion-cowork/",
  "entry": "http://localhost:11432/shell/fusion-cowork/",
  "devices": ["desktop"],
  "category": "platform",
  "searchProviders": [
    { "id": "workflows", "label": "工作流", "label_en": "Workflows", "endpoint": "/api/v1/cowork/search" }
  ],
  "pages": [
    { "route": "/workflows", "title": "工作流", "title_en": "Workflows" },
    { "route": "/runs", "title": "运行记录", "title_en": "Runs" }
  ],
  "notifications": [
    { "id": "cowork-approvals", "label": "审批", "label_en": "Approvals", "endpoint": "/api/v1/cowork/notifications", "kind": "approvals" },
    { "id": "cowork-tasks", "label": "任务", "label_en": "Tasks", "endpoint": "/api/v1/cowork/tasks", "kind": "tasks" }
  ],
  "home": {
    "cards": [
      { "id": "monthly-close", "title": "月度对账", "title_en": "Monthly close", "description": "对账并生成报告", "route": "/workflows/monthly-close", "chip": true }
    ]
  }
}
```

## Adoption checklist

1. Add the arrays to `web/manifest.json` in the module repo.
2. Re-register (or restart the module's registration on boot).
3. Verify on :11432: ⌘K query hits the provider, bell lists items, sidebar
   lists sub-pages.
