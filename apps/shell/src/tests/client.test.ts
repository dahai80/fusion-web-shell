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
