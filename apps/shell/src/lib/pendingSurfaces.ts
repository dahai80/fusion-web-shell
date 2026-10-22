/**
 * Session-scoped pending-surface guard (issue #46): known gateway surfaces
 * that are not shipped yet answer 404/501. The first such answer marks the
 * surface pending for the whole session — later loads short-circuit without
 * touching the network, so pages show one muted pending badge instead of a
 * 404 per render.
 */

const pending = new Set<string>();

export function isSurfacePending(surface: string): boolean {
    return pending.has(surface);
}

export function markSurfacePending(surface: string): void {
    if (pending.has(surface)) return;
    pending.add(surface);
    console.log('[pendingSurfaces] gateway surface not shipped, muted for session:', surface);
}

export function resetPendingSurfaces(): void {
    pending.clear();
}

export type GuardedResult<T> = { pending: true; data?: undefined } | { pending: false; data: T };

/** True when an error is the gateway surface not shipped yet (404/501). */
function isNotShipped(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    return status === 404 || status === 501;
}

export async function guardedLoad<T>(
    surface: string,
    fetchFn: () => Promise<T>
): Promise<GuardedResult<T>> {
    if (isSurfacePending(surface)) return { pending: true };
    try {
        return { pending: false, data: await fetchFn() };
    } catch (err) {
        if (isNotShipped(err)) {
            markSurfacePending(surface);
            return { pending: true };
        }
        throw err;
    }
}
