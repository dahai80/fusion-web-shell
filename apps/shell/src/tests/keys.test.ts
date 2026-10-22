import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { useAuth } from '../stores/auth';
import { GatewayError, flattenScopes, scopeMatrix, setKeysApi, useKeys } from '../stores/keys';
import type { ApiKeyRow } from '../stores/keys';
import type { ModuleManifest } from '../types/manifest';

const mk = (over: Partial<ModuleManifest> & { id: string }): ModuleManifest => ({
    title: over.id,
    path: `/shell/${over.id}/`,
    entry: `/shell/${over.id}/`,
    devices: ['desktop'],
    category: 'platform',
    ...over,
});

const row = (over: Partial<ApiKeyRow> = {}): ApiKeyRow => ({
    name: 'ci',
    key_prefix: 'fk-…ab12',
    status: 'active',
    scopes: ['fusion-cowork:read'],
    quota_limit: 0,
    quota_used: 0,
    rpm: 0,
    tpm: 0,
    rotated_at: null,
    created_at: '2026-10-22T00:00:00Z',
    updated_at: '2026-10-22T00:00:00Z',
    ...over,
});

describe('scope matrix (issue #35)', () => {
    it('builds module x action rows from registered manifests, default unchecked', () => {
        const rows = scopeMatrix([mk({ id: 'fusion-cowork' }), mk({ id: 'fusion-as' })]);
        expect(rows.map((r) => r.moduleId)).toEqual(['fusion-cowork', 'fusion-as']);
        for (const row of rows) {
            expect(row.actions).toEqual([
                { action: 'read', checked: false },
                { action: 'write', checked: false },
                { action: 'execute', checked: false },
            ]);
        }
    });

    it('flattenScopes emits module:action pairs for checked boxes only', () => {
        const rows = scopeMatrix([mk({ id: 'fusion-cowork' })]);
        rows[0]!.actions[0]!.checked = true;
        rows[0]!.actions[2]!.checked = true;
        expect(flattenScopes(rows)).toEqual(['fusion-cowork:read', 'fusion-cowork:execute']);
    });
});

describe('keys store (issue #35, gateway #271 wire contract)', () => {
    beforeEach(() => {
        useKeys.setState({ items: [], loading: false, error: null, gatewayPending: false });
        useAuth.setState({
            user: {
                user_id: 'u1',
                display_name: 'U1',
                roles: ['admin'],
                permissions: [],
                must_change_password: false,
            },
            token: 't',
            status: 'authed',
        });
    });

    it('lists keys from the session-gated gateway surface', async () => {
        setKeysApi({
            list: async () => [row()],
        });
        await useKeys.getState().refresh();
        expect(useKeys.getState().items).toHaveLength(1);
        expect(useKeys.getState().items[0]!.key_prefix).toBe('fk-…ab12');
        expect(useKeys.getState().gatewayPending).toBe(false);
    });

    it('marks gateway-pending on 404 (session proxy #271 not shipped yet)', async () => {
        setKeysApi({
            list: async () => {
                throw new GatewayError('not found', 404);
            },
        });
        await useKeys.getState().refresh();
        expect(useKeys.getState().gatewayPending).toBe(true);
        expect(useKeys.getState().items).toHaveLength(0);
    });

    it('create returns one-time plaintext and refreshes the list', async () => {
        const created: unknown[] = [];
        setKeysApi({
            list: async () => [],
            create: async (body) => {
                created.push(body);
                return { name: body.name, plaintext: 'fk-plain-xyz' };
            },
        });
        const res = await useKeys.getState().create('ci', ['fusion-cowork:read']);
        expect(res).toEqual({ name: 'ci', plaintext: 'fk-plain-xyz' });
        expect(created).toEqual([{ name: 'ci', scopes: ['fusion-cowork:read'] }]);
    });

    it('rotate returns the new plaintext; revoke just refreshes', async () => {
        let rotated = '';
        let revoked = '';
        setKeysApi({
            list: async () => [],
            rotate: async (name) => {
                rotated = name;
                return { name, plaintext: 'fk-new' };
            },
            revoke: async (name) => {
                revoked = name;
            },
        });
        const r = await useKeys.getState().rotate('ci');
        expect(r!.plaintext).toBe('fk-new');
        expect(rotated).toBe('ci');
        await useKeys.getState().revoke('ci');
        expect(revoked).toBe('ci');
    });
});
