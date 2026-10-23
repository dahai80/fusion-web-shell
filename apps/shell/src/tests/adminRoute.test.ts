import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import {
    adminPageForPath,
    navigateShell,
    pathForAdminPage,
} from '../lib/adminRoute';

// Minimal window shim (happy-dom's dispatchEvent is broken under bun test):
// only what navigateShell touches — pathname, pushState, event listeners.
const listeners = new Set<(e: { type: string }) => void>();
const state = { path: '/', len: 1 };

class FakeEvent {
    type: string;
    constructor(type: string) {
        this.type = type;
    }
}

(globalThis as Record<string, unknown>).window = {
    get location() {
        return { get pathname() { return state.path; } };
    },
    get history() {
        return {
            get length() { return state.len; },
            pushState(_s: unknown, _t: string, path: string) {
                state.path = path;
                state.len += 1;
            },
        };
    },
    addEventListener(_type: string, fn: (e: { type: string }) => void) {
        listeners.add(fn);
    },
    removeEventListener(_type: string, fn: (e: { type: string }) => void) {
        listeners.delete(fn);
    },
    dispatchEvent(e: { type: string }) {
        for (const fn of listeners) fn(e);
    },
};
(globalThis as Record<string, unknown>).Event = FakeEvent;

describe('adminPageForPath', () => {
    it('maps the three admin deep-link paths', () => {
        expect(adminPageForPath('/settings')).toBe('settings');
        expect(adminPageForPath('/users')).toBe('admin-users');
        expect(adminPageForPath('/audit')).toBe('audit');
    });

    it('returns null for the shell root and unknown paths', () => {
        expect(adminPageForPath('/')).toBeNull();
        expect(adminPageForPath('')).toBeNull();
        expect(adminPageForPath('/shell/cowork/')).toBeNull();
        expect(adminPageForPath('/settings/extra')).toBeNull();
    });
});

describe('pathForAdminPage', () => {
    it('round-trips with adminPageForPath', () => {
        for (const page of ['settings', 'admin-users', 'audit'] as const) {
            expect(adminPageForPath(pathForAdminPage(page))).toBe(page);
        }
    });
});

describe('navigateShell', () => {
    let events: { type: string }[] = [];
    const handler = (e: { type: string }) => events.push(e);

    beforeEach(() => {
        listeners.delete(handler);
        listeners.add(handler);
        navigateShell('/');
        events = [];
    });

    it('pushes the path and notifies route listeners', () => {
        navigateShell('/audit');
        expect(window.location.pathname).toBe('/audit');
        expect(events.length).toBe(1);
    });

    it('notifies without a duplicate history entry when path is unchanged', () => {
        navigateShell('/audit');
        const len = window.history.length;
        navigateShell('/audit');
        expect(window.history.length).toBe(len);
        expect(events.length).toBe(2);
    });

    it('navigates back to the shell root', () => {
        navigateShell('/audit');
        navigateShell('/');
        expect(window.location.pathname).toBe('/');
        expect(events.length).toBe(2);
    });
});
