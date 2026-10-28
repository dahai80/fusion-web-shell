import './domSetup';
import { describe, expect, it } from 'bun:test';
import { createHostBridge } from '../src/host';

// Issue #81: cross-origin dev-embedded iframes silently lost ALL postMessage
// traffic because the host bridge snapshotted the target origin while the
// frame still showed about:blank. The origin must resolve per send from the
// iframe's real state (location, else the src attribute), never "null", and
// an explicit option must win.
type Posted = { data: unknown; origin: string };

function fakeIframe(opts: { href?: string; src?: string }) {
    const posted: Posted[] = [];
    const frame = {
        location: { href: opts.href ?? 'about:blank' },
        frameElement: opts.src
            ? { getAttribute: (name: string) => (name === 'src' ? opts.src : null) }
            : undefined,
        postMessage: (data: unknown, origin: string) => {
            posted.push({ data, origin });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    return { frame, posted };
}

const HOST_OPTS = {
    getToken: () => null,
    onToast: () => {},
    onActiveTask: () => {},
    proxyHttp: async () => ({ status: 200, data: {} }),
};

describe('createHostBridge target origin (issue #81)', () => {
    it('resolves the cross-origin module origin from the iframe src per send', () => {
        const { frame, posted } = fakeIframe({ src: 'http://127.0.0.1:11590/shell/fusion-x/' });
        const bridge = createHostBridge('t1', frame, HOST_OPTS);
        bridge.notifyTheme('dark');
        expect(posted.length).toBeGreaterThan(0);
        expect(posted[posted.length - 1]?.origin).toBe('http://127.0.0.1:11590');
        bridge.destroy();
    });

    it('resolves the live frame location when readable', () => {
        const { frame, posted } = fakeIframe({ href: 'http://127.0.0.1:11591/shell/fusion-y/' });
        const bridge = createHostBridge('t2', frame, HOST_OPTS);
        bridge.notifyLang('en');
        expect(posted[posted.length - 1]?.origin).toBe('http://127.0.0.1:11591');
        bridge.destroy();
    });

    it('never targets "null" (about:blank) — falls back to the host origin', () => {
        const { frame, posted } = fakeIframe({});
        const bridge = createHostBridge('t3', frame, HOST_OPTS);
        bridge.notifyTheme('dark');
        expect(posted[posted.length - 1]?.origin).not.toBe('null');
        expect(posted[posted.length - 1]?.origin).toBe(window.location.origin);
        bridge.destroy();
    });

    it('explicit options.origin always wins', () => {
        const { frame, posted } = fakeIframe({ href: 'http://127.0.0.1:11591/' });
        const bridge = createHostBridge('t4', frame, { ...HOST_OPTS, origin: 'http://host.test' });
        bridge.notifyTheme('dark');
        expect(posted[posted.length - 1]?.origin).toBe('http://host.test');
        bridge.destroy();
    });
});
