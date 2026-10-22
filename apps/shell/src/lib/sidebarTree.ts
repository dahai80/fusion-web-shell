/**
 * Sidebar accordion state (issue #46): level 1 = product, level 2 = its
 * pages. One product expanded at a time; the active product auto-expands
 * when a tab focuses it.
 */

/** Toggle a product row: switching to it expands it, re-toggling collapses. */
export function toggleExpanded(prev: string | null, id: string): string | null {
    return prev === id ? null : id;
}

/** A tab focusing a product forces its expansion; no active tab keeps state. */
export function syncExpandedWithActive(
    prev: string | null,
    activeManifestId: string | null
): string | null {
    return activeManifestId ?? prev;
}
