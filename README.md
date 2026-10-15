# fusion-web-shell

Fusion unified web shell — the host of the fusion-* union web frontend.

Single entry (`fusion-gateway` :11432), unified login + RBAC, per-tab same-origin iframe modules, KeepAlive tabs, hot-pluggable manifest registry, H5 responsive.

## Status

Design phase. Implementation not started.

- PRD: `~/fusion/architecture/fusion-union-web-prd-1015.md`
- UI Spec: `~/fusion/architecture/fusion-web-ui-spec-1015.md`

## Monorepo Layout (Bun workspaces)

```
apps/shell        # Host shell: React 18 + Vite + TS + Tailwind + Zustand
                  #   Tab Manager (KeepAlive via display:none), per-tab same-origin
                  #   iframe loader (/shell/<id>/), manifest client, host
                  #   ErrorBoundary, unified HTTP client, dev HMR switch,
                  #   desktop sidebar / mobile bottom-nav dual layout
packages/sdk      # @fusion/web-sdk — postMessage bridge client:
                  #   http proxy (host token), toast, tab API, theme, devices probe
packages/ui       # @fusion/web-ui — design tokens, Tailwind preset, shared
                  #   components (StatusBadge, LogStream, MetricChart, DataTable,
                  #   TaskProgress, EmptyState/ErrorState/Skeleton), formatters,
                  #   H5 responsive primitives
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
