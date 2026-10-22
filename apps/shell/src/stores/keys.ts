import { sharedClient } from '@/api/client';
import type { ModuleManifest } from '@/types/manifest';
import { create } from 'zustand';

/**
 * User API keys (issue #35, gateway K2 #262 + session proxy #271):
 * self-serve create / rotate / revoke / usage on the Settings page, called
 * through the session-gated /api/v1/shell/keys surface (admin role).
 * Plaintext (raw_key) is shown exactly once (never logged, never persisted
 * client-side); the list surface only carries the fk-…tail4 prefix. Until
 * the gateway ships the session proxy the store degrades to a
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

/** List projection from the gateway — no hashes, no plaintext, tail-4 prefix. */
export interface ApiKeyRow {
    name: string;
    key_prefix: string;
    status: string;
    scopes: string[];
    tenant?: string;
    quota_limit: number;
    quota_used: number;
    rpm: number;
    tpm: number;
    rotated_at: string | null;
    created_at: string;
    updated_at: string;
}

/** Create/rotate payload — raw_key appears exactly once, here. */
export interface IssuedKey {
    name: string;
    plaintext: string;
}

export class GatewayError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

interface RawIssued {
    name?: string;
    raw_key?: string;
}

interface RawListEntry {
    name?: string;
    key_prefix?: string;
    status?: string;
    scopes?: unknown;
    tenant?: string;
    quota_limit?: number;
    quota_used?: number;
    rpm?: number;
    tpm?: number;
    rotated_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

function sanitizeListEntry(raw: RawListEntry): ApiKeyRow {
    return {
        name: typeof raw.name === 'string' ? raw.name : '',
        key_prefix: typeof raw.key_prefix === 'string' ? raw.key_prefix : 'fk-…',
        status: typeof raw.status === 'string' ? raw.status : 'active',
        scopes: Array.isArray(raw.scopes)
            ? raw.scopes.filter((s): s is string => typeof s === 'string')
            : [],
        tenant: typeof raw.tenant === 'string' ? raw.tenant : undefined,
        quota_limit: typeof raw.quota_limit === 'number' ? raw.quota_limit : 0,
        quota_used: typeof raw.quota_used === 'number' ? raw.quota_used : 0,
        rpm: typeof raw.rpm === 'number' ? raw.rpm : 0,
        tpm: typeof raw.tpm === 'number' ? raw.tpm : 0,
        rotated_at: typeof raw.rotated_at === 'string' ? raw.rotated_at : null,
        created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
        updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
    };
}

function toIssued(raw: RawIssued): IssuedKey {
    return {
        name: typeof raw.name === 'string' ? raw.name : '',
        plaintext: typeof raw.raw_key === 'string' ? raw.raw_key : '',
    };
}

export interface KeysApi {
    list(): Promise<ApiKeyRow[]>;
    create(body: { name: string; scopes: string[] }): Promise<IssuedKey>;
    rotate(name: string): Promise<IssuedKey>;
    revoke(name: string): Promise<void>;
}

let api: KeysApi = {
    async list() {
        try {
            const r = await sharedClient().get<unknown>('/api/v1/shell/keys', {
                quiet: true,
            });
            const rows = Array.isArray(r) ? r : [];
            return rows.map((row) => sanitizeListEntry(row as RawListEntry));
        } catch (err) {
            throw toGatewayError(err);
        }
    },
    async create(body) {
        try {
            const r = await sharedClient().post<RawIssued>('/api/v1/shell/keys', body);
            return toIssued(r);
        } catch (err) {
            throw toGatewayError(err);
        }
    },
    async rotate(name) {
        try {
            const r = await sharedClient().post<RawIssued>(`/api/v1/shell/keys/${name}/rotate`);
            return toIssued(r);
        } catch (err) {
            throw toGatewayError(err);
        }
    },
    async revoke(name) {
        try {
            await sharedClient().delete(`/api/v1/shell/keys/${name}`);
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
    /** Session-gated key surface (gateway #271) not shipped yet — pending state. */
    gatewayPending: boolean;
    refresh(): Promise<void>;
    create(name: string, scopes: string[]): Promise<IssuedKey>;
    rotate(name: string): Promise<IssuedKey | null>;
    revoke(name: string): Promise<void>;
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
            console.warn('[keys] list failed:', ge.status, ge.message);
            set({
                loading: false,
                gatewayPending: ge.status === 404 || ge.status === 501,
                error: ge.status === 404 || ge.status === 501 ? null : ge.message,
            });
        }
    },

    async create(name, scopes) {
        const issued = await api.create({ name, scopes });
        console.log('[keys] created key', issued.name, 'scopes:', scopes.length);
        await get().refresh();
        return issued;
    },

    async rotate(name) {
        try {
            const issued = await api.rotate(name);
            console.log('[keys] rotated key', name);
            await get().refresh();
            return issued;
        } catch (err) {
            console.error('[keys] rotate failed', name, err);
            set({ error: (err as Error).message });
            return null;
        }
    },

    async revoke(name) {
        await api.revoke(name);
        console.log('[keys] revoked key', name);
        await get().refresh();
    },
}));
