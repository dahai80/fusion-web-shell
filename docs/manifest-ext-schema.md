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

## home.projects — Projects/Spaces section (shell#41)

`home.projects` is an optional list of poll sources declaring the module's
spaces/projects for the Home "项目 / 空间" section (organization dimension).
Same contract family as notifications (gateway #273 passes them through):

| Field | Type | Required | Description |
|---|---|---|---|
| `home.projects[].id` | string | yes | Source key, unique within the module |
| `home.projects[].label` | string | yes | zh label |
| `home.projects[].label_en` | string | no | en label |
| `home.projects[].endpoint` | string | yes | Gateway-absolute `/...` path polled for `{"items": [...]}` |

Poll contract: `GET ${endpoint}` returns `{"items": [...]}` with per-item
fields:

| Item field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Stable item id (not a fresh UUID per poll) |
| `title` | string | yes | Space/project name |
| `description` | string | no | One-line description (row tooltip) |
| `updated_at` | string | no | Rendered as-is |
| `route` | string | yes | Module-relative `/...`, no `#`; row deep-links `${entry}#${route}` into the space view |

Items without a valid `route` are dropped (a space without a deep link is
not actionable). The section groups entries by module, greys unreachable
modules, and stays hidden when no module declares `home.projects`.
Per-source failure isolation matches the task feed.

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
| `space` | string | no | Owning space/project display name — rendered as a chip on the card (shell#41) |
| `space_route` | string | no | Module-relative `/...`; chip click deep-links into the owning space view |

Approval wire contract: the host `POST`s to `pending_approval.endpoint` with
`{"id": <item id>, "action": "reject" | "allow_once" | "always_allow"}`; any
2xx removes the card, an error keeps it. The endpoint is
gateway-absolute and must answer same-origin through the gateway.
Per-source failure isolation: a broken source keeps its last good snapshot
(offline tasks stay readable), and never breaks the rest of the feed.

## permissions_policy — iframe Permissions-Policy delegation (shell#66)

AV modules (voice agents, camera sessions) call `getUserMedia` inside their
shell iframe. Permissions-Policy delegation can only come from the embedding
frame, so a module declares what it needs and the host renders the matching
`allow` attribute:

```json
"permissions_policy": ["microphone", "camera"]
```

- Allowed tokens: `microphone`, `camera` (anything else is dropped on load).
- Each feature is delegated scoped to the frame's own origin — the host
  renders `allow="microphone 'src'; camera 'src'"`, not an open wildcard.
- Absent/empty field = no `allow` attribute at all; existing modules are
  unchanged. Without the attribute a cross-origin iframe gets an instant
  `NotAllowedError` on `getUserMedia` before any user prompt.

## group — two-level sidebar menu (shell#71)

Modules that ship several sibling apps collapse into ONE top-level menu entry
with second-level items, instead of occupying N flat sidebar slots:

```json
"group": "fusion-office",
"group_title": "Office 套件",
"group_title_en": "Office Suite",
"sort": 2
```

- `group` — stable group id (`[A-Za-z0-9._-]`, ≤64 chars); all manifests
  sharing it render under one collapsible entry inside their category.
- `group_title` / `group_title_en` — group display name (≤64 chars), taken
  from the members.
- `sort` — ordering hint within the group (ascending; ties fall back to
  title order).
- Untouched for ungrouped modules. RBAC stays per-module: a role without a
  member grant just does not see that level-2 item; the group header hides
  when no member is visible. All-members-unreachable greys the header
  (PRD §5.2), it stays expandable.
- Groups get NO bottom-nav slot on mobile — grouped members live in the
  drawer; bottom nav pins top-level ungrouped modules only.
- Gateway pass-through landed in fusion-gateway#298 (issue #297): the
  registry delivers `group` / `group_title` / `group_title_en` / `sort`
  verbatim, so a re-registration is enough to light the menu up.

## Validation (both sides)

Gateway validates at registration (fusion-gateway#252), the shell host
re-sanitizes on load — modules must satisfy the strictest of the two:

- Endpoints and page routes: gateway-absolute `/...`, no `..` traversal.
- Page routes and home card routes must not contain `#` (the deep-link form is `#${route}`).
- `kind` is restricted to `approvals|runs|engine|tasks`.
- `permissions_policy` is restricted to `microphone|camera`.
- `group` is `[A-Za-z0-9._-]` ≤64 chars; group titles ≤64 chars; `sort` must be finite.
- Each ext array caps at 32 entries (`home.cards` / `home.projects` included).

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
    ],
    "projects": [
      { "id": "spaces", "label": "空间", "label_en": "Spaces", "endpoint": "/api/v1/cowork/spaces" }
    ]
  },
  "permissions_policy": ["microphone"]
}
```

## Adoption checklist

1. Add the arrays to `web/manifest.json` in the module repo.
2. Re-register (or restart the module's registration on boot).
3. Verify on :11432: ⌘K query hits the provider, bell lists items, sidebar
   lists sub-pages.
4. For `home.projects` (shell#41): serve `GET ${endpoint}` with
   `{"items": [{id, title, route, description?, updated_at?}]}` and stamp
   task items with `space`/`space_route` so Home task cards show the
   owning-space chip.
