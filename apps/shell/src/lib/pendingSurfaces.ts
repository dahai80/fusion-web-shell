/**
 * Session-scoped pending-surface guard (issue #46): known gateway surfaces
 * that are not shipped yet answer 404/501. The first such answer marks the
 * surface pending for the whole session — later loads short-circuit without
 * touching the network, so pages show one muted pending badge instead of a
 * 404 per render.
 */

const STORE_KEY = 'fusion.shell.pendingSurfaces';

/** Backed by sessionStorage: /settings, /audit, /users are full page loads. */
function loadPending(): Set<string> {
    try {
        const raw = sessionStorage.getItem(STORE_KEY);
        const list = raw ? (JSON.parse(raw) as unknown) : [];
        return new Set(
            Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
        );
    } catch (err) {
        console.warn('[pendingSurfaces] store load failed', err);
        return new Set();
    }
}

const pending = loadPending();

function persist(): void {
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify([...pending]));
    } catch (err) {
        console.warn('[pendingSurfaces] store persist failed', err);
    }
}

export function isSurfacePending(surface: string): boolean {
    return pending.has(surface);
}

export function markSurfacePending(surface: string): void {
    if (pending.has(surface)) return;
    pending.add(surface);
    persist();
    console.log('[pendingSurfaces] gateway surface not shipped, muted for session:', surface);
}

export function resetPendingSurfaces(): void {
    pending.clear();
    persist();
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
