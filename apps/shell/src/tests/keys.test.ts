import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { useAuth } from '../stores/auth';
import { GatewayError, flattenScopes, scopeMatrix, setKeysApi, useKeys } from '../stores/keys';
import type { ModuleManifest } from '../types/manifest';

const mk = (over: Partial<ModuleManifest> & { id: string }): ModuleManifest => ({
    title: over.id,
    path: `/shell/${over.id}/`,
    entry: `/shell/${over.id}/`,
    devices: ['desktop'],
    category: 'platform',
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

describe('keys store (issue #35)', () => {
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

    it('lists keys from the gateway', async () => {
        setKeysApi({
            list: async () => [
                {
                    key_id: 'k1',
                    name: 'ci',
                    tail4: 'ab12',
                    scopes: ['fusion-cowork:read'],
                    created_at: '2026-10-22T00:00:00Z',
                    last_used_at: null,
                    recent_calls: 7,
                },
            ],
        });
        await useKeys.getState().refresh();
        expect(useKeys.getState().items).toHaveLength(1);
        expect(useKeys.getState().items[0]!.tail4).toBe('ab12');
        expect(useKeys.getState().gatewayPending).toBe(false);
    });

    it('marks gateway-pending on 404 (K2 not shipped yet)', async () => {
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
                return { key_id: 'k2', plaintext: 'fk-plain-xyz' };
            },
        });
        const res = await useKeys.getState().create('ci', ['fusion-cowork:read']);
        expect(res).toEqual({ key_id: 'k2', plaintext: 'fk-plain-xyz' });
        expect(created).toEqual([{ name: 'ci', scopes: ['fusion-cowork:read'] }]);
    });

    it('rotate returns the new plaintext; revoke just refreshes', async () => {
        let rotated = '';
        let revoked = '';
        setKeysApi({
            list: async () => [],
            rotate: async (id) => {
                rotated = id;
                return { key_id: id, plaintext: 'fk-new' };
            },
            revoke: async (id) => {
                revoked = id;
            },
        });
        const r = await useKeys.getState().rotate('k1');
        expect(r!.plaintext).toBe('fk-new');
        expect(rotated).toBe('k1');
        await useKeys.getState().revoke('k1');
        expect(revoked).toBe('k1');
    });
});
