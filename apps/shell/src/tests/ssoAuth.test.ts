import './domSetup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { consumeTicketParam, exchangeTicket } from '@/lib/ssoAuth';

// Issue #130: cloud-try SSO ticket consumption + honest degradation when
// the gateway SSO route is not deployed yet. happy-dom's History throws
// under the global registrator, so replaceState is stubbed via
// defineProperty (assignment alone proved flaky on CI runners).

let query = '';

const stubReplaceState = (): void => {
    // Own-property override on window itself: robust even if another suite
    // replaced the global window with a shim whose history getter returns
    // fresh objects (adminRoute.test.ts used to leak exactly that on CI).
    Object.defineProperty(window, 'history', {
        configurable: true,
        value: {
            replaceState: (_state: unknown, _title: string, url?: string | URL) => {
                if (typeof url === 'string') {
                    query = url.includes('?') ? `?${url.split('?')[1] ?? ''}` : '';
                    (window.location as { search: string }).search = query;
                    (window.location as { href: string }).href = url;
                }
            },
        },
    });
};

describe('sso ticket handoff (#130)', () => {
    const realFetch = globalThis.fetch;

    beforeEach(() => {
        query = '';
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                ...window.location,
                search: query,
                href: 'http://127.0.0.1:11430/',
                pathname: '/',
            },
        });
        stubReplaceState();
    });

    const stubFetch = (status: number, body: unknown): void => {
        globalThis.fetch = ((): Promise<Response> =>
            Promise.resolve(
                new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
            )) as unknown as typeof fetch;
    };

    it('consumeTicketParam reads and strips ?ticket=', () => {
        window.history.replaceState(null, '', 'http://127.0.0.1:11430/?ticket=tok123');
        expect(consumeTicketParam()).toBe('tok123');
        expect(window.location.search).toBe('');
        expect(consumeTicketParam()).toBeNull();
    });

    it('returns null without a ticket', () => {
        expect(consumeTicketParam()).toBeNull();
    });

    it('exchangeTicket returns the session pair', async () => {
        stubFetch(200, { token: 'shell-tok', identity_token: 'id-jwt' });
        const session = await exchangeTicket('abc');
        expect(session).toEqual({ token: 'shell-tok', identity_token: 'id-jwt' });
    });

    it('exchangeTicket degrades to null on 404 (route pending)', async () => {
        stubFetch(404, 'not found');
        expect(await exchangeTicket('abc')).toBeNull();
    });

    it('exchangeTicket throws on other failures', async () => {
        stubFetch(401, 'no');
        await expect(exchangeTicket('abc')).rejects.toThrow('status 401');
        globalThis.fetch = realFetch;
    });
});
