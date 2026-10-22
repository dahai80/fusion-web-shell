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
