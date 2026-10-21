import { sharedClient } from '@/api/client';
import type { ModuleManifest } from '@/types/manifest';
import { create } from 'zustand';

/**
 * User API keys (issue #35, gateway K2 = fusion-gateway#262): self-serve
 * create / rotate / revoke / usage on the Settings page. Plaintext is shown
 * exactly once (never logged, never persisted client-side); the list surface
 * only carries tail-4. Until the gateway ships K2 the store degrades to a
 * gateway-pending state on 404 instead of an error wall.
 */

export const KEY_ACTIONS = ['read', 'write', 'execute'] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

export interface ScopeRow {
    moduleId: string;
    moduleTitle: string;
    actions: Array<{ action: KeyAction; checked: boolean }>;
}

/** Scope matrix driven by registered manifests (default all-unchecked). */
export function scopeMatrix(manifests: ModuleManifest[]): ScopeRow[] {
    return manifests.map((m) => ({
        moduleId: m.id,
        moduleTitle: m.title,
        actions: KEY_ACTIONS.map((action) => ({ action, checked: false })),
    }));
}

export function flattenScopes(rows: ScopeRow[]): string[] {
    return rows.flatMap((r) =>
        r.actions.filter((a) => a.checked).map((a) => `${r.moduleId}:${a.action}`)
    );
}

export interface ApiKeyRow {
    key_id: string;
    name: string;
    tail4: string;
    scopes: string[];
    created_at: string;
    last_used_at: string | null;
    recent_calls: number;
}

export interface IssuedKey {
    key_id: string;
    plaintext: string;
}

export class GatewayError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export interface KeysApi {
    list(): Promise<ApiKeyRow[]>;
    create(body: { name: string; scopes: string[] }): Promise<IssuedKey>;
    rotate(keyId: string): Promise<IssuedKey>;
    revoke(keyId: string): Promise<void>;
}

let api: KeysApi = {
    async list() {
        try {
            const r = await sharedClient().get<{ items?: ApiKeyRow[] }>('/api/v1/keys', {
                quiet: true,
            });
            return Array.isArray(r.items) ? r.items : [];
        } catch (err) {
            throw toGatewayError(err);
        }
    },
    async create(body) {
        try {
            return await sharedClient().post<IssuedKey>('/api/v1/keys', body);
        } catch (err) {
            throw toGatewayError(err);
        }
    },
    async rotate(keyId) {
        try {
            return await sharedClient().post<IssuedKey>(`/api/v1/keys/${keyId}/rotate`);
        } catch (err) {
            throw toGatewayError(err);
        }
    },
    async revoke(keyId) {
        try {
            await sharedClient().delete(`/api/v1/keys/${keyId}`);
        } catch (err) {
            throw toGatewayError(err);
        }
    },
};

function toGatewayError(err: unknown): GatewayError {
    const status = (err as { status?: number })?.status;
    if (typeof status === 'number') return new GatewayError((err as Error).message, status);
    return new GatewayError((err as Error).message, 0);
}

/** Test seam: swap the HTTP layer. */
export function setKeysApi(next: Partial<KeysApi>): void {
    api = { ...api, ...next };
}

interface KeysState {
    items: ApiKeyRow[];
    loading: boolean;
    error: string | null;
    /** Gateway K2 (fusion-gateway#262) not shipped yet — show pending state. */
    gatewayPending: boolean;
    refresh(): Promise<void>;
    create(name: string, scopes: string[]): Promise<IssuedKey>;
    rotate(keyId: string): Promise<IssuedKey | null>;
    revoke(keyId: string): Promise<void>;
}

export const useKeys = create<KeysState>((set, get) => ({
    items: [],
    loading: false,
    error: null,
    gatewayPending: false,

    async refresh() {
        set({ loading: true, error: null });
        try {
            const items = await api.list();
            set({ items, loading: false, gatewayPending: false });
            console.log('[keys] listed', items.length, 'keys');
        } catch (err) {
            const ge = err as GatewayError;
            console.warn('[keys] list failed:', ge.message);
            set({
                loading: false,
                gatewayPending: ge.status === 404 || ge.status === 501,
                error: ge.status === 404 || ge.status === 501 ? null : ge.message,
            });
        }
    },

    async create(name, scopes) {
        const issued = await api.create({ name, scopes });
        console.log('[keys] created key', issued.key_id, 'scopes:', scopes.length);
        await get().refresh();
        return issued;
    },

    async rotate(keyId) {
        try {
            const issued = await api.rotate(keyId);
            console.log('[keys] rotated key', keyId);
            await get().refresh();
            return issued;
        } catch (err) {
            console.error('[keys] rotate failed', keyId, err);
            set({ error: (err as Error).message });
            return null;
        }
    },

    async revoke(keyId) {
        await api.revoke(keyId);
        console.log('[keys] revoked key', keyId);
        await get().refresh();
    },
}));
