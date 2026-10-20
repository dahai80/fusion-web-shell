import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import {
    MAX_TABS,
    entryFor,
    newTab,
    parseDevModules,
    restorePersistedTabs,
    useTabs,
} from '../stores/tabs';
import type { ModuleManifest } from '../types/manifest';

const mk = (id: string): ModuleManifest => ({
    id,
    title: `模块 ${id}`,
    path: `/${id}`,
    entry: `/shell/${id}/`,
    devices: ['desktop'],
    category: 'platform',
});

beforeEach(() => {
    localStorage.clear();
    useTabs.setState({ tabs: [], activeTabId: null });
});

describe('parseDevModules', () => {
    it('parses id:port pairs', () => {
        const map = parseDevModules('fusion-mlx:5010, fusion-agent-studio:5020, bad, x:abc');
        expect(map.get('fusion-mlx')).toBe('5010');
        expect(map.get('fusion-agent-studio')).toBe('5020');
        expect(map.size).toBe(2);
    });
    it('handles empty input', () => {
        expect(parseDevModules(undefined).size).toBe(0);
    });
});

describe('entryFor (A6 dev HMR)', () => {
    it('overrides entry for dev modules only', () => {
        const dev = parseDevModules('fusion-mlx:5010');
        expect(entryFor(mk('fusion-mlx'), dev)).toBe('http://localhost:5010/?embedded=1');
        expect(entryFor(mk('fusion-kb'), dev)).toBe('/shell/fusion-kb/');
    });
});

describe('tabs store', () => {
    it('opens a tab and reuses it for the same manifest (single instance default)', () => {
        const s = useTabs.getState();
        const id1 = s.openTab(mk('fusion-mlx'));
        const id2 = useTabs.getState().openTab(mk('fusion-mlx'));
        expect(id1).toBe(id2);
        expect(useTabs.getState().tabs.length).toBe(1);
    });
    it('opens multi-instance tabs with seq suffix', () => {
        useTabs.getState().openTab(mk('fusion-mlx'));
        useTabs.getState().openTab(mk('fusion-mlx'), { multi: true });
        const tabs = useTabs.getState().tabs;
        expect(tabs.length).toBe(2);
        expect(tabs[1]!.id).toBe('fusion-mlx#2');
        expect(tabs[1]!.title).toContain('2');
    });
    it('enforces max 12 tabs', () => {
        for (let i = 0; i < MAX_TABS + 2; i++) {
            useTabs.getState().openTab(mk(`mod-${i}`), { multi: true });
        }
        expect(useTabs.getState().tabs.length).toBe(MAX_TABS);
    });
    it('closes tab and moves active to last remaining', () => {
        const a = useTabs.getState().openTab(mk('a'));
        const b = useTabs.getState().openTab(mk('b'));
        expect(useTabs.getState().activeTabId).toBe(b!);
        useTabs.getState().closeTab(b!);
        expect(useTabs.getState().tabs.length).toBe(1);
        expect(useTabs.getState().activeTabId).toBe(a!);
    });
    it('blocks close while a task is active', () => {
        const id = useTabs.getState().openTab(mk('a'));
        useTabs.getState().setActiveTask(id!, true);
        expect(useTabs.getState().closeTab(id!)).toBe(false);
        expect(useTabs.getState().tabs.length).toBe(1);
        useTabs.getState().setActiveTask(id!, false);
        expect(useTabs.getState().closeTab(id!)).toBe(true);
    });
    it('marks crashed: src released, status crashed, others unaffected (A2/A4)', () => {
        useTabs.getState().openTab(mk('a'));
        const b = useTabs.getState().openTab(mk('b'));
        useTabs.getState().markCrashed(b!, 'test');
        const tabs = useTabs.getState().tabs;
        expect(tabs.find((t) => t.id === 'b')?.status).toBe('crashed');
        expect(tabs.find((t) => t.id === 'b')?.src).toBeNull();
        expect(tabs.find((t) => t.id === 'a')?.status).toBe('active');
    });
    it('restoreIframe resets crashed tab with fresh src', () => {
        useTabs.getState().openTab(mk('a'));
        useTabs.getState().markCrashed('a', 'test');
        const id = useTabs.getState().restoreIframe(mk('a'));
        const tab = useTabs.getState().tabs.find((t) => t.id === id);
        expect(tab?.status).toBe('active');
        expect(tab?.src).toBe('/shell/a/');
        expect(tab?.crashedAt).toBeUndefined();
    });
    it('persists open tabs and restores skeletons', () => {
        useTabs.getState().openTab(mk('fusion-mlx'));
        const raw = localStorage.getItem('fusion.shell.tabs');
        expect(raw).toContain('fusion-mlx');
    });
    it('newTab builds prod entry', () => {
        const tab = newTab(mk('x'), new Map());
        expect(tab.src).toBe('/shell/x/');
        expect(tab.seq).toBe(1);
    });
});

describe('tabs store extensions (gaps #2/#8)', () => {
    it('forceCloseTab closes even with active task', () => {
        const id = useTabs.getState().openTab(mk('a'));
        useTabs.getState().setActiveTask(id!, true);
        useTabs.getState().forceCloseTab(id!);
        expect(useTabs.getState().tabs.length).toBe(0);
    });
    it('setTransientError sets and clears banner message', () => {
        const id = useTabs.getState().openTab(mk('a'));
        useTabs.getState().setTransientError(id!, '服务异常');
        expect(useTabs.getState().tabs[0]!.transientError).toBe('服务异常');
        useTabs.getState().setTransientError(id!, null);
        expect(useTabs.getState().tabs[0]!.transientError).toBeNull();
    });
    it('restorePersistedTabs rebuilds skeletons and marks interrupted tasks', () => {
        localStorage.setItem(
            'fusion.shell.tabs',
            JSON.stringify([
                {
                    id: 'fusion-mlx',
                    manifestId: 'fusion-mlx',
                    title: 'MLX',
                    seq: 1,
                    hasActiveTask: true,
                },
                { id: 'ghost', manifestId: 'no-such', title: 'Ghost', seq: 2 },
            ])
        );
        const restored = restorePersistedTabs([mk('fusion-mlx')], new Map());
        expect(restored).toBe(1);
        const tab = useTabs.getState().tabs[0]!;
        expect(tab.id).toBe('fusion-mlx');
        expect(tab.interrupted).toBe(true);
        expect(tab.src).toBe('/shell/fusion-mlx/');
        expect(tab.hasActiveTask).toBe(false);
        expect(useTabs.getState().activeTabId).toBe('fusion-mlx');
    });
    it('restorePersistedTabs skips unknown manifests', () => {
        localStorage.setItem(
            'fusion.shell.tabs',
            JSON.stringify([{ id: 'ghost', manifestId: 'no-such', title: 'Ghost', seq: 1 }])
        );
        expect(restorePersistedTabs([mk('a')], new Map())).toBe(0);
        expect(useTabs.getState().tabs.length).toBe(0);
    });
});

describe('tab deep-link routes (issue #24, C8)', () => {
    beforeEach(() => {
        localStorage.removeItem('fusion.shell.tabs');
        useTabs.setState({ tabs: [], activeTabId: null });
    });

    it('newTab with route appends hash to entry src and composes title', () => {
        const m = mk('fusion-mlx');
        const tab = newTab(m, new Map(), 1, { route: '/metrics', pageTitle: 'Metrics' });
        expect(tab.src).toBe('/shell/fusion-mlx/#/metrics');
        expect(tab.title).toBe('模块 fusion-mlx · Metrics');
    });

    it('dev override keeps ?embedded=1 before the hash route', () => {
        const m = mk('fusion-mlx');
        const tab = newTab(m, parseDevModules('fusion-mlx:5199'), 1, { route: '/metrics' });
        expect(tab.src).toBe('http://localhost:5199/?embedded=1#/metrics');
    });

    it('openTab without route keeps plain entry src', () => {
        const m = mk('fusion-as');
        const tab = newTab(m, new Map(), 1);
        expect(tab.src).toBe(m.entry);
        expect(tab.title).toBe(m.title);
    });

    it('openTab with new route re-srcs the existing tab and activates it', () => {
        const m = mk('fusion-as');
        const first = useTabs.getState().openTab(m);
        const tabBefore = useTabs.getState().tabs.find((t) => t.id === first)!;
        const second = useTabs.getState().openTab(m, { route: '/runs', pageTitle: 'Runs' });
        expect(second).toBe(first);
        const state = useTabs.getState();
        expect(state.activeTabId).toBe(first);
        const tab = state.tabs.find((t) => t.id === first)!;
        expect(tab.src).toBe(`${tabBefore.src}#/runs`);
        expect(tab.title).toContain('Runs');
    });

    it('openTab with the same route only activates, no src churn (KeepAlive)', () => {
        const m = mk('fusion-as');
        useTabs.getState().openTab(m, { route: '/runs' });
        const before = useTabs.getState().tabs[0]!;
        useTabs.getState().openTab(m, { route: '/runs' });
        const after = useTabs.getState().tabs[0]!;
        expect(after.src).toBe(before.src);
        expect(useTabs.getState().activeTabId).toBe(after.id);
    });
});
