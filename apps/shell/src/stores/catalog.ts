import { fetchProductCatalog, isGatewayPending } from '@/api/endpoints';
import { type CatalogEntry, sanitizeCatalog } from '@/lib/catalogTree';
import { create } from 'zustand';

/**
 * Product-catalog store (issue #116). One fetch per session; 404 pins
 * gatewayPending (fusion-gateway#488) and the sidebar degrades to
 * installed-only rendering. 401/403 degrade the same way: the gateway
 * serves the catalog on the fg-key chain (/v1/catalog) with no shell-session
 * alias yet (fusion-gateway#504), so a browser session cannot reach it —
 * that is a pending integration, not a user-facing error.
 */

interface CatalogState {
    entries: CatalogEntry[];
    loaded: boolean;
    gatewayPending: boolean;
    error: string | null;
    load(force?: boolean): Promise<void>;
}

export const useCatalog = create<CatalogState>((set, get) => ({
    entries: [],
    loaded: false,
    gatewayPending: false,
    error: null,
    async load(force) {
        if (get().loaded && !force) return;
        try {
            const raw = await fetchProductCatalog();
            const entries = sanitizeCatalog(raw);
            set({ entries, loaded: true, gatewayPending: false, error: null });
            console.log('[catalog] loaded:', entries.length, 'products');
        } catch (err) {
            const status = (err as { status?: number })?.status;
            if (isGatewayPending(err) || status === 401 || status === 403) {
                console.warn(
                    '[catalog] not reachable from the browser session yet (fusion-gateway#504: /v1/catalog is fg-key only, no shell-session alias)'
                );
                set({ gatewayPending: true, loaded: true, error: null });
                return;
            }
            console.error('[catalog] load failed', err);
            set({ error: (err as Error).message });
        }
    },
}));
