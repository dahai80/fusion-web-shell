# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Fusion unified web shell — the host of the fusion-* union web frontend. Single entry via `fusion-gateway` (:11432), unified login + RBAC, per-tab same-origin iframe modules, KeepAlive tabs, hot-pluggable manifest registry, H5 responsive.

**Status: design phase.** Directories `apps/shell`, `packages/sdk`, `packages/ui`, `docs/` are intentional placeholders — do not delete them; create the planned structure inside them. Authoritative specs:

- PRD: `~/fusion/architecture/fusion-union-web-prd-1015.md` (manifest schema is §5.1)
- UI Spec: `~/fusion/architecture/fusion-web-ui-spec-1015.md` (baseline stack §10.1)

## Planned Architecture

Bun workspaces monorepo:

- `apps/shell` — host shell: React 18 + Vite + TS + Tailwind + Zustand. Tab Manager with KeepAlive via `display:none` (do NOT unmount tabs), per-tab same-origin iframe loader at `/shell/<id>/`, manifest client, host ErrorBoundary, unified HTTP client, dev HMR switch, desktop sidebar / mobile bottom-nav dual layout.
- `packages/sdk` (`@fusion/web-sdk`) — postMessage bridge client used by module iframes: http proxy (host token), toast, tab API, theme, devices probe.
- `packages/ui` (`@fusion/web-ui`) — design tokens, Tailwind preset, shared components (StatusBadge, LogStream, MetricChart, DataTable, TaskProgress, EmptyState/ErrorState/Skeleton), formatters, H5 responsive primitives.

### Module Integration Contract

Any fusion-* module integrates by:

1. Shipping `web/manifest.json` (schema: PRD §5.1) in its own repo
2. Building a plain static SPA bundle; `fusion-gateway` serves it at `/shell/<id>/`
3. Optionally depending on `@fusion/web-sdk` (+ `@fusion/web-ui`)
4. Dev mode: `FUSION_DEV_MODULES=<id>:<port>` pointing at the module's Vite dev server for HMR

New module UIs must use the baseline stack (React 18 + Vite + TS + Tailwind + Bun). Existing frontends may keep their stack during the transition but must migrate before P3 close-out.

## Commands

Once scaffolding exists (Bun workspaces):

```bash
bun install
bun run build
bun test
```

Shell dev server proxies module dev servers via `FUSION_DEV_MODULES`.

## Related Projects

- `fusion-gateway` (Go, :11432) — serves module bundles, fronts `fusion-mlx`. Never route module HTTP around the gateway.
- `fusion-studio` (SwiftUI) — the desktop client sibling; keep terminology/features aligned where the PRD specifies parity.

This repo is an independent git repository inside the `/Users/dahai/fusion` monorepo (see root `CLAUDE.md` for shared venv, sibling-project rules, and code style: 4-space multiples, no docstrings, always logging). Commit here, never at repo root.
