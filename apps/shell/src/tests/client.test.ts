import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { ApiClient } from '../api/client';
import { useTabs } from '../stores/tabs';
import type { ModuleManifest } from '../types/manifest';

const manifest: ModuleManifest = {
    id: 'fusion-cowork',
    title: 'cowork',
    path: '/shell/fusion-cowork/',
    entry: '/shell/fusion-cowork/',
    devices: ['desktop'],
    category: 'platform',
};

const err500 = () =>
    new Response(JSON.stringify({ code: 'upstream', message: 'boom', retryable: true }), {
        status: 500,
    });

describe('ApiClient quiet requests (review fix #2)', () => {
    beforeEach(() => {
        useTabs.setState({ tabs: [], activeTabId: null });
    });

    const mkClient = () => new ApiClient({ tokenProvider: () => null, onUnauthorized: () => {} });

    it('non-quiet 5xx surfaces transient error on the active tab', async () => {
        useTabs.getState().openTab(manifest);
        globalThis.fetch = (async () => err500()) as unknown as typeof fetch;
        await expect(mkClient().get('/api/x')).rejects.toThrow('boom');
        expect(useTabs.getState().tabs[0]!.transientError).toBe('boom');
    });

    it('quiet 5xx skips toast + transient strip (background polls)', async () => {
        useTabs.getState().openTab(manifest);
        globalThis.fetch = (async () => err500()) as unknown as typeof fetch;
        await expect(mkClient().get('/api/x', { quiet: true })).rejects.toThrow('boom');
        expect(useTabs.getState().tabs[0]!.transientError).toBeUndefined();
    });
});

describe('ApiClient scoped 401 handling (issue #28)', () => {
    let unauthorizedCalls: number;
    beforeEach(() => {
        useTabs.setState({ tabs: [], activeTabId: null });
        sessionStorage.clear();
        unauthorizedCalls = 0;
    });

    const mkClient = () =>
        new ApiClient({
            tokenProvider: () => sessionStorage.getItem('fusion.shell.token'),
            onUnauthorized: () => {
                unauthorizedCalls += 1;
            },
        });

    const err401 = (body: unknown) =>
        new Response(JSON.stringify(body), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });

    it('module API 401 keeps the session and surfaces the owning tab error', async () => {
        sessionStorage.setItem('fusion.shell.token', 'tok');
        useTabs.getState().openTab(manifest);
        globalThis.fetch = (async () =>
            err401({
                code: 'auth_failed',
                message: 'cowork token invalid',
            })) as unknown as typeof fetch;
        await expect(mkClient().get('/api/cowork/notifications')).rejects.toThrow(
            'cowork token invalid'
        );
        expect(unauthorizedCalls).toBe(0);
        expect(sessionStorage.getItem('fusion.shell.token')).toBe('tok');
        expect(useTabs.getState().tabs[0]!.transientError).toBe('cowork token invalid');
    });

    it('quiet module API 401 stays silent (background polls)', async () => {
        sessionStorage.setItem('fusion.shell.token', 'tok');
        useTabs.getState().openTab(manifest);
        globalThis.fetch = (async () =>
            err401({
                code: 'auth_failed',
                message: 'cowork token invalid',
            })) as unknown as typeof fetch;
        await expect(mkClient().get('/api/cowork/notifications', { quiet: true })).rejects.toThrow(
            'cowork token invalid'
        );
        expect(unauthorizedCalls).toBe(0);
        expect(useTabs.getState().tabs[0]!.transientError).toBeUndefined();
    });

    it('shell API 401 clears the session and triggers logout redirect', async () => {
        sessionStorage.setItem('fusion.shell.token', 'tok');
        globalThis.fetch = (async () =>
            err401({
                code: 'unauthorized',
                message: 'session expired',
            })) as unknown as typeof fetch;
        await expect(mkClient().get('/api/v1/shell/me')).rejects.toThrow('unauthorized');
        expect(unauthorizedCalls).toBe(1);
        expect(sessionStorage.getItem('fusion.shell.token')).toBeNull();
    });

    it('password change 401 is treated as session invalid (first-party auth surface)', async () => {
        sessionStorage.setItem('fusion.shell.token', 'tok');
        globalThis.fetch = (async () =>
            err401({
                code: 'unauthorized',
                message: 'session expired',
            })) as unknown as typeof fetch;
        await expect(mkClient().post('/api/v1/password', { password: 'x' })).rejects.toThrow(
            'unauthorized'
        );
        expect(unauthorizedCalls).toBe(1);
        expect(sessionStorage.getItem('fusion.shell.token')).toBeNull();
    });

    it('module API 401 with no envelope falls back to a generic message', async () => {
        sessionStorage.setItem('fusion.shell.token', 'tok');
        useTabs.getState().openTab(manifest);
        globalThis.fetch = (async () =>
            new Response('denied', { status: 401 })) as unknown as typeof fetch;
        await expect(mkClient().get('/api/cowork/runs')).rejects.toThrow('模块鉴权失败 (401)');
        expect(unauthorizedCalls).toBe(0);
        expect(useTabs.getState().tabs[0]!.transientError).toBe('模块鉴权失败 (401)');
    });
});

describe('ApiClient quiet 403 (issue #66 companion)', () => {
    let forbidden: string[];
    beforeEach(() => {
        useTabs.setState({ tabs: [], activeTabId: null });
        forbidden = [];
    });

    const mkClient = () =>
        new ApiClient({
            tokenProvider: () => null,
            onUnauthorized: () => {},
            onForbidden: (message) => {
                forbidden.push(message);
            },
        });

    const err403 = () =>
        new Response(JSON.stringify({ code: 'forbidden', message: 'no grant' }), { status: 403 });

    it('non-quiet 403 still surfaces the forbidden toast', async () => {
        globalThis.fetch = (async () => err403()) as unknown as typeof fetch;
        await expect(mkClient().get('/api/x')).rejects.toThrow('no grant');
        expect(forbidden).toEqual(['no grant']);
    });

    it('quiet 403 (engine-model probe, polls) surfaces nothing', async () => {
        globalThis.fetch = (async () => err403()) as unknown as typeof fetch;
        await expect(mkClient().get('/api/x', { quiet: true })).rejects.toThrow('no grant');
        expect(forbidden).toEqual([]);
    });
});
