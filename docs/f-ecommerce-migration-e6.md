# Migration E6 admin surfaces — shell ↔ gateway contract (issue #42)

Source: `~/fusion/business/f-ecommerce` settings.html / audit.html / users.html,
generalized (no e-commerce semantics). The shell hosts the GUI; the data
endpoints move to the gateway. Until a surface ships, the page section degrades
to a gateway-pending notice on 404/501 (same pattern as the #35 keys page).

All endpoints are **session-gated** and answer same-origin through
fusion-gateway, following the `/api/v1/shell/keys` precedent (fusion-gateway#272).
Role gates: vault/connectors/policy = `admin`; roles + menu matrix = `admin`
(backend should follow the E5 identity contract, fusion-identity#12); audit =
`admin` or `auditor`.

## Platform Adapters (encrypted credential vault)

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/v1/shell/adapters` | — | `{adapters: [{platform, configured, enabled, credentials_masked, rate_limit_rps, jitter_ms}]}` |
| PUT | `/api/v1/shell/adapters/{platform}` | `{credentials, rate_limit_rps, jitter_ms, enabled}` | 2xx saved; `credentials` stored **encrypted at rest** |
| POST | `/api/v1/shell/adapters/{platform}/test` | — | `{ok: bool, reason?/error_code?}` |

`credentials_masked` is the server-side masked projection (e.g.
`{"access_token": "…ab12"}`) — plaintext never round-trips to the browser. The
shell stores/edits references only; storage pairs with the gateway KeyService
line (fusion-gateway#261/#262).

## Third-Party Connectors (config-first onboarding)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/shell/connectors` | — | `{connectors: [{id, kind, operations: [...], problems: [...]}]}` |
| PUT | `/api/v1/shell/connectors/{id}` | full connector JSON document | `{saved: bool, problems?: [...]}` |
| POST | `/api/v1/shell/connectors/{id}/test` | `{operation?}` (empty = first operation) | `{ok, operation?, duration_ms?, detail?/reason?/error_code?}` |

Package validation/enable delegates to fusion-plugins-ecosystem#30. Connector
credentials resolve from the vault via `credential_ref` (never inline).

## Policy Overrides

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/shell/config/{key}` | — | `{defaults: object, overrides: object}` |
| PUT | `/api/v1/shell/config/{key}` | override JSON (top-level sections) | 2xx saved, effective immediately |

`key` is an open vocabulary (e.g. `pricing_policies`, `banned_words`) — modules
read overrides merged over template defaults at runtime (L2 rules).

## Audit trail

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/v1/shell/audit` | `user`, `action_class` | `{entries: [{ts, user, role, action_class, method, path, outcome, duration_ms, integrity_ok}]}` |

`action_class` vocabulary: `read | write | approval | agent_run | config | auth`.
`outcome`: `ok | denied | error`. `integrity_ok: false` renders as **tampered**
(hash-chain break = log modified outside the system). Aggregates gateway key
audit + module audit logs (agent-studio audit_logger, cowork run trajectory).

## Roles + Menu Permissions (E5 contract)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/shell/roles` | — | `{roles: [{name, builtin, write_classes, description, user_count}], write_classes: [...]}` |
| POST | `/api/v1/shell/roles` | `{name, description, write_classes}` | 2xx created |
| DELETE | `/api/v1/shell/roles/{name}` | — | 2xx deleted (fails while users assigned) |
| GET | `/api/v1/shell/menu-permissions` | — | `{defaults: {menus}, overrides: {menus}}` |
| PUT | `/api/v1/shell/menu-permissions` | `{menus: [{id, label, href, roles}]}` | 2xx saved |

Menu doc: `menus[].roles` lists the role names that see the item; edits take
effect on the user's next page load. Built-in roles are fixed; custom roles
grant write classes. Sidebar rendering follows the identity menu matrix per
role once E5 lands (fusion-identity#12).

## Hosting notes

- Pages are shell host routes: `/settings` (three E6 sections below API keys),
  `/users` (Users / Roles / Menu Permissions tabs), `/audit`. Users lives at
  `/users`, not `/admin/users`: the gateway reserves `/admin/*` for its own
  embedded admin SPA, which would shadow the shell route.
- The f-ecommerce GUI is migrated unchanged: same tables, columns, `<details>`
  configure forms, test buttons, and honest badge semantics — rendered with the
  shell design tokens instead of app.css.
