import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { guardedLoad, isSurfacePending, resetPendingSurfaces } from '../lib/pendingSurfaces';

function errWithStatus(status: number): Error {
    return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe('pending surface guard (issue #46)', () => {
    beforeEach(() => {
        sessionStorage.removeItem('fusion.shell.pendingSurfaces');
        resetPendingSurfaces();
    });

    it('pending marks survive a page reload via sessionStorage', async () => {
        await guardedLoad('adapters', async () => {
            throw errWithStatus(404);
        });
        expect(sessionStorage.getItem('fusion.shell.pendingSurfaces')).toContain('adapters');
    });

    it('404 marks the surface pending and later calls skip the network entirely', async () => {
        let calls = 0;
        const fetchFn = async (): Promise<unknown> => {
            calls += 1;
            throw errWithStatus(404);
        };
        const first = await guardedLoad('adapters', fetchFn);
        expect(first).toEqual({ pending: true });
        expect(isSurfacePending('adapters')).toBe(true);
        const second = await guardedLoad('adapters', fetchFn);
        expect(second).toEqual({ pending: true });
        expect(calls).toBe(1);
    });

    it('501 also marks pending', async () => {
        const r = await guardedLoad('roles', async () => {
            throw errWithStatus(501);
        });
        expect(r).toEqual({ pending: true });
        expect(isSurfacePending('roles')).toBe(true);
    });

    it('success returns data and stays retryable (surface not marked)', async () => {
        const r = await guardedLoad('audit', async () => ({ entries: [1, 2] }));
        expect(r).toEqual({ pending: false, data: { entries: [1, 2] } });
        expect(isSurfacePending('audit')).toBe(false);
        let calls = 0;
        await guardedLoad('audit', async () => {
            calls += 1;
            return {};
        });
        expect(calls).toBe(1);
    });

    it('non-pending errors rethrow without marking the surface', async () => {
        let threw: unknown = null;
        try {
            await guardedLoad('connectors', async () => {
                throw errWithStatus(500);
            });
        } catch (err) {
            threw = err;
        }
        expect((threw as Error).message).toBe('HTTP 500');
        expect(isSurfacePending('connectors')).toBe(false);
    });

    it('surfaces are independent keys', async () => {
        await guardedLoad('adapters', async () => {
            throw errWithStatus(404);
        });
        expect(isSurfacePending('adapters')).toBe(true);
        expect(isSurfacePending('connectors')).toBe(false);
    });
});
