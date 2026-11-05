import './domSetup';
import { describe, expect, it } from 'bun:test';
import { createHostBridge, isHttpErrorResult } from '../src/host';

// Issue #75: `case 'theme'` returns a bare string, and the old
// `'__httpError' in (result as object)` guard threw a TypeError on it —
// the module never received its theme response.
describe('isHttpErrorResult (issue #75)', () => {
    it('bare string results (theme pull) are not http errors', () => {
        expect(isHttpErrorResult('light')).toBe(false);
        expect(isHttpErrorResult('dark')).toBe(false);
    });
    it('null, undefined and primitives are not http errors', () => {
        expect(isHttpErrorResult(null)).toBe(false);
        expect(isHttpErrorResult(undefined)).toBe(false);
        expect(isHttpErrorResult(42)).toBe(false);
        expect(isHttpErrorResult(false)).toBe(false);
    });
    it('plain object results are not http errors', () => {
        expect(isHttpErrorResult({ status: 200, ok: true, data: {} })).toBe(false);
        expect(isHttpErrorResult({ viewport: 'desktop', mode: null })).toBe(false);
        expect(isHttpErrorResult({ ok: true })).toBe(false);
    });
    it('__httpError envelopes are http errors', () => {
        expect(isHttpErrorResult({ __httpError: true, status: 502, code: 'x', message: 'y' })).toBe(
            true
        );
    });
});

// Issue #130: identity-token bridge method hands the session's identity JWT
// to modules for gateway metering; absent handler = null (skip propagation).
describe('host bridge identity-token (#130)', () => {
    function makeBridge(getIdentityToken?: () => string | null) {
        const replies: Array<Record<string, unknown>> = [];
        const target = {
            postMessage: (msg: unknown) => replies.push(msg as Record<string, unknown>),
        };
        const iframeWindow = {
            location: { href: 'https://host.example/shell/x/' },
            postMessage: () => undefined,
        } as unknown as Window;
        const bridge = createHostBridge('tab-1', iframeWindow, {
            origin: 'https://host.example',
            getToken: () => 'tok',
            onToast: () => undefined,
            onActiveTask: () => undefined,
            proxyHttp: async () => ({ status: 200, data: {} }),
            ...(getIdentityToken ? { getIdentityToken } : {}),
        });
        bridge.iframeWindow = target as unknown as Window;
        return { bridge, replies };
    }

    function dispatch(bridge: ReturnType<typeof makeBridge>['bridge'], id: string) {
        window.dispatchEvent(
            new MessageEvent('message', {
                source: bridge.iframeWindow as unknown as MessageEvent['source'],
                origin: 'https://host.example',
                data: { type: 'request', id, method: 'identity-token', payload: null },
            })
        );
    }

    const flush = () => new Promise((r) => setTimeout(r, 10));

    it('returns the session identity token', async () => {
        const { bridge, replies } = makeBridge(() => 'eyJhbGciOi');
        dispatch(bridge, 't1');
        await flush();
        expect(replies[0]).toMatchObject({
            type: 'response',
            id: 't1',
            ok: true,
            result: 'eyJhbGciOi',
        });
        bridge.destroy();
    });

    it('degrades to null without a handler or on a local session', async () => {
        const { bridge, replies } = makeBridge();
        dispatch(bridge, 't2');
        await flush();
        expect(replies[0]).toMatchObject({ type: 'response', id: 't2', ok: true, result: null });
        bridge.destroy();
    });
});
