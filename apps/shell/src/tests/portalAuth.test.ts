import './domSetup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { consumeCodeParam, consumeStashedReturn, redirectToPortal } from '@/lib/portalAuth';

// Issue #126: one-time code handoff consumption + safe portal redirect.
// happy-dom's History throws under the global registrator, so replaceState
// and assign are stubbed with plain spies over a mutable query backing.

let query = '';

beforeEach(() => {
    query = '';
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
            ...window.location,
            search: query,
            href: 'http://127.0.0.1:11430/',
            pathname: '/',
            assign: (url: string) => {
                (window.location as { assigned?: string }).assigned = url;
            },
        },
    });
    window.history.replaceState = ((_state: unknown, _title: string, url?: string | URL) => {
        if (typeof url === 'string') {
            query = url.includes('?') ? `?${url.split('?')[1] ?? ''}` : '';
            (window.location as { search: string }).search = query;
            (window.location as { href: string }).href = url;
        }
    }) as typeof window.history.replaceState;
});

describe('portal handoff (#126)', () => {
    it('consumeCodeParam reads and strips ?code=', () => {
        window.history.replaceState(null, '', 'http://127.0.0.1:11430/?code=abc123');
        expect(consumeCodeParam()).toBe('abc123');
        expect(window.location.search).toBe('');
        expect(consumeCodeParam()).toBeNull();
    });

    it('returns null without a code', () => {
        expect(consumeCodeParam()).toBeNull();
    });

    it('redirectToPortal sends the root-path redirect and stashes the return intent (#164)', () => {
        (window.location as { pathname: string }).pathname = '/users';
        (window.location as { origin: string }).origin = 'http://127.0.0.1:11430';
        redirectToPortal();
        expect((window.location as { assigned?: string }).assigned).toBe(
            `/auth/?redirect=${encodeURIComponent('http://127.0.0.1:11430/')}`
        );
        expect(consumeStashedReturn()).toBe('/users');
        expect(consumeStashedReturn()).toBeNull();
    });

    it('stash unwraps the /login ?return= destination (#164)', () => {
        (window.location as { pathname: string }).pathname = '/login';
        (window.location as { origin: string }).origin = 'http://127.0.0.1:11432';
        (window.location as { search: string }).search = '?return=%2Fshell%2F';
        redirectToPortal();
        expect((window.location as { assigned?: string }).assigned).toBe(
            `/auth/?redirect=${encodeURIComponent('http://127.0.0.1:11432/')}`
        );
        expect(consumeStashedReturn()).toBe('/shell/');
    });
});
