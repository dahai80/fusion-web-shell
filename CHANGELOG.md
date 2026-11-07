---
doc_id: fusion-web-shell/changelog
product: fusion-web-shell
class: platform
entry: service
doc_type: changelog
title: { zh: "fusion-web-shell 变更记录", en: "fusion-web-shell changelog" }
audience: engineer
status: draft
version: 0.1.4
updated: 2026-11-07
owner: @dahai
source_of_truth:
    - package.json
    - apps/shell/package.json
---

# 变更记录 / changelog

版本号跟随 workspace 包（`apps/shell/package.json` 等，当前 0.1.4）。逐项变更见 GitHub issues 与 PR 历史；本文件只记录版本与主题。

Versions follow the workspace packages (`apps/shell/package.json` etc., currently 0.1.4). Per-item changes live in GitHub issues and PR history; this file records versions and themes only.

## 0.1.4 (current)

- Host shell features per README「Status」: two-level sidebar with four-section taxonomy (issue #99), visibility = registration + RBAC (issue #100), honest degradation for pending gateway surfaces (issue #46), three-state product catalog (issue #116), model policy plane (issue #114).
- 统一认证门户 `apps/auth`（issue #125/#126）与云试用 SSO（issue #130）。
- Unified auth portal `apps/auth` (issues #125/#126) and cloud-try SSO (issue #130).

## 0.1.2

- business 领域应用接入基线（`docs/business-apps-shell-integration.md` 记录的基线版本）。
- Integration baseline for business domain apps (baseline version recorded in `docs/business-apps-shell-integration.md`).

## 0.1.0

- 初始 workspace 脚手架：apps/shell、packages/{design-tokens,sdk,ui}。
- Initial workspace scaffold: apps/shell, packages/{design-tokens,sdk,ui}.
