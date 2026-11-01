/**
 * Sidebar accordion state (issue #46): level 1 = product, level 2 = its
 * pages. One product expanded at a time; the active product auto-expands
 * when a tab focuses it.
 */

/** Toggle a product row: switching to it expands it, re-toggling collapses. */
export function toggleExpanded(prev: string | null, id: string): string | null {
    return prev === id ? null : id;
}

/**
 * Click on a product's main row (issue #46 follow-up): when collapsed, the
 * click expands the tree and opens the product's default page in one hop;
 * when already expanded, the click collapses it in place (no navigation) —
 * otherwise the row could only ever expand (the chevron was the sole
 * collapse affordance).
 */
export function rowClickIntent(
    expanded: string | null,
    id: string
): { expand: boolean; navigate: boolean } {
    return expanded === id ? { expand: false, navigate: false } : { expand: true, navigate: true };
}

/** A tab focusing a product forces its expansion; no active tab keeps state. */
export function syncExpandedWithActive(
    prev: string | null,
    activeManifestId: string | null
): string | null {
    return activeManifestId ?? prev;
}

/**
 * L2 page active state (issue #53): the focused tab owns a specific page
 * when it was deep-linked with a route; a plain module tab (no route) owns
 * none, so no L2 row highlights spuriously.
 */
export function isPageActive(
    activeTab: { manifestId: string; route?: string } | null,
    manifestId: string,
    route: string
): boolean {
    if (!activeTab || !activeTab.route) return false;
    return activeTab.manifestId === manifestId && activeTab.route === route;
}

/** Group expansion is per group (issue #71) — independent of other groups. */
export function toggleGroupExpanded(prev: Set<string>, groupId: string): Set<string> {
    const next = new Set(prev);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    return next;
}

/**
 * A tab focusing a group member expands its group (issue #71); every other
 * group keeps its state. No active tab leaves the set untouched.
 */
export function syncGroupsWithActive(
    prev: Set<string>,
    activeManifestId: string | null,
    manifests: { id: string; group?: string }[]
): Set<string> {
    if (!activeManifestId) return prev;
    const active = manifests.find((m) => m.id === activeManifestId);
    if (!active?.group) return prev;
    if (prev.has(active.group)) return prev;
    const next = new Set(prev);
    next.add(active.group);
    return next;
}

/**
 * Standalone first-class sidebar entry (issue #92): a module pinned above
 * the groups — present only when registered and granted (RBAC), so the
 * entry never leaks a module the session cannot open.
 */
export function standaloneEntry<T extends { id: string }>(
    manifests: T[],
    canView: (id: string) => boolean,
    moduleId: string
): T | null {
    const m = manifests.find((x) => x.id === moduleId);
    return m && canView(m.id) ? m : null;
}

/**
 * Unread approvals count for one module (issue #92): feeds the standalone
 * entry's badge from the notification center's approvals sources.
 */
export function unreadApprovalsFor(
    items: { id: string; moduleId: string; kind: string }[],
    readIds: Set<string>,
    moduleId: string
): number {
    return items.filter(
        (i) => i.moduleId === moduleId && i.kind === 'approvals' && !readIds.has(i.id)
    ).length;
}
