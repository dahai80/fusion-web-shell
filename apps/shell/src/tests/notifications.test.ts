import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { useAuth } from '../stores/auth';
import { useManifests } from '../stores/manifests';
import { setFetcher, useNotifications } from '../stores/notifications';
import { useTabs } from '../stores/tabs';
import type { ModuleManifest } from '../types/manifest';

const mk = (over: Partial<ModuleManifest> & { id: string }): ModuleManifest => ({
    title: over.id,
    path: `/shell/${over.id}/`,
    entry: `/shell/d/${over.id}/`,
    devices: ['desktop'],
    category: 'platform',
    ...over,
});

function setupSources(mods: ModuleManifest[]): void {
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
    useManifests.setState({
        manifests: mods,
        loaded: true,
        unreachableIds: new Set(mods.filter((m) => m.unreachable).map((m) => m.id)),
    });
}

describe('notification center (issue #24, G11/C3)', () => {
    beforeEach(() => {
        localStorage.removeItem('fusion.shell.notifications.read');
        useNotifications.setState({ items: [], readIds: new Set(), polling: false });
        useTabs.setState({ tabs: [], activeTabId: null });
        useManifests.setState({ manifests: [], loaded: false, unreachableIds: new Set() });
        useAuth.setState({ user: null, token: null, status: 'unknown' });
        setFetcher(async () => ({}));
    });

    it('polls declared sources, maps items, dedupes across polls', async () => {
        setupSources([
            mk({
                id: 'fusion-cowork',
                notifications: [
                    {
                        id: 'approvals',
                        label: '审批',
                        endpoint: '/api/cowork/approvals?status=pending',
                        kind: 'approvals',
                    },
                    {
                        id: 'runs',
                        label: '运行',
                        endpoint: '/api/cowork/runs?state=terminal',
                        kind: 'runs',
                    },
                ],
            }),
        ]);
        const calls: string[] = [];
        setFetcher(async (path) => {
            calls.push(path);
            if (path.includes('approvals')) {
                return { items: [{ id: 'a1', title: '审批: W7 节点 f_run', route: '/approvals' }] };
            }
            return { items: [{ id: 'r88', title: 'run R-88 完成', route: '/runs' }] };
        });
        await useNotifications.getState().pollNow();
        const items = useNotifications.getState().items;
        expect(items).toHaveLength(2);
        expect(items[0]!.id).toBe('fusion-cowork:approvals:a1');
        expect(items[0]!.kind).toBe('approvals');
        expect(items[0]!.sourceId).toBe('approvals');
        expect(items[0]!.moduleId).toBe('fusion-cowork');
        expect(items[0]!.route).toBe('/approvals');
        expect(items.every((i) => ['info', 'warning', 'error'].includes(i.level))).toBe(true);
        await useNotifications.getState().pollNow();
        expect(useNotifications.getState().items).toHaveLength(2);
        expect(useNotifications.getState().unreadCount()).toBe(2);
        expect(calls).toHaveLength(4);
    });

    it('unread → markRead → markAllRead, read set persists', async () => {
        setupSources([
            mk({
                id: 'fusion-as',
                notifications: [
                    { id: 'runs', label: '运行', endpoint: '/api/as/runs', kind: 'runs' },
                ],
            }),
        ]);
        setFetcher(async () => ({
            items: [{ id: 'x1', title: 'run R-201 完成', route: '/runs' }],
        }));
        await useNotifications.getState().pollNow();
        expect(useNotifications.getState().unreadCount()).toBe(1);
        useNotifications.getState().markRead('fusion-as:runs:x1');
        expect(useNotifications.getState().unreadCount()).toBe(0);
        const stored = JSON.parse(
            localStorage.getItem('fusion.shell.notifications.read') ?? '[]'
        ) as string[];
        expect(stored).toContain('fusion-as:runs:x1');
        await useNotifications.getState().pollNow();
        expect(useNotifications.getState().unreadCount()).toBe(0);
        setFetcher(async () => ({ items: [{ id: 'x2', title: 'run R-202 完成' }] }));
        await useNotifications.getState().pollNow();
        expect(useNotifications.getState().unreadCount()).toBe(1);
        useNotifications.getState().markAllRead();
        expect(useNotifications.getState().unreadCount()).toBe(0);
    });

    it('source failure isolated; unreachable skipped', async () => {
        setupSources([
            mk({
                id: 'fusion-cowork',
                notifications: [{ id: 'n', label: 'N', endpoint: '/api/bad', kind: 'runs' }],
            }),
            mk({
                id: 'fusion-mlx',
                notifications: [{ id: 'm', label: 'M', endpoint: '/api/mlx', kind: 'engine' }],
            }),
            mk({ id: 'fusion-sec' }),
        ]);
        useManifests.setState((s) => ({
            unreachableIds: new Set([...s.unreachableIds, 'fusion-sec']),
        }));
        setFetcher(async (path) => {
            if (path.startsWith('/api/bad')) throw new Error('boom');
            return { items: [{ id: 'e1', title: 'mlx 内存压力 91%' }] };
        });
        await useNotifications.getState().pollNow();
        expect(useNotifications.getState().items.map((i) => i.id)).toEqual(['fusion-mlx:m:e1']);
    });

    it('openItem deep-links into a tab and marks read', async () => {
        setupSources([
            mk({
                id: 'fusion-cowork',
                notifications: [
                    {
                        id: 'approvals',
                        label: '审批',
                        endpoint: '/api/cowork/approvals',
                        kind: 'approvals',
                    },
                ],
            }),
        ]);
        setFetcher(async () => ({ items: [{ id: 'p1', title: '审批: W7', route: '/approvals' }] }));
        await useNotifications.getState().pollNow();
        useNotifications.getState().openItem('fusion-cowork:approvals:p1');
        const tab = useTabs.getState().tabs[0];
        expect(tab?.manifestId).toBe('fusion-cowork');
        expect(tab?.src).toContain('#/approvals');
        expect(useNotifications.getState().unreadCount()).toBe(0);
    });

    it('start/stop lifecycle: double start does not double-poll', async () => {
        setupSources([
            mk({
                id: 'fusion-as',
                notifications: [{ id: 'r', label: 'R', endpoint: '/api/as/runs', kind: 'runs' }],
            }),
        ]);
        let calls = 0;
        setFetcher(async () => {
            calls += 1;
            return { items: [] };
        });
        await useNotifications.getState().start(50);
        await useNotifications.getState().start(50);
        await new Promise((r) => setTimeout(r, 130));
        useNotifications.getState().stop();
        const after = calls;
        await new Promise((r) => setTimeout(r, 80));
        expect(useNotifications.getState().polling).toBe(false);
        expect(calls).toBe(after);
        expect(calls).toBeGreaterThanOrEqual(2);
    });
});

it('stop cancels polling; no orphan interval after stop→start→stop', async () => {
    setupSources([
        mk({
            id: 'fusion-as',
            notifications: [{ id: 'r', label: 'R', endpoint: '/api/as/runs', kind: 'runs' }],
        }),
    ]);
    let calls = 0;
    setFetcher(async () => {
        calls += 1;
        return { items: [] };
    });
    const p1 = useNotifications.getState().start(20);
    useNotifications.getState().stop();
    const p2 = useNotifications.getState().start(20);
    await Promise.all([p1, p2]);
    useNotifications.getState().stop();
    const after = calls;
    await new Promise((r) => setTimeout(r, 80));
    expect(useNotifications.getState().polling).toBe(false);
    expect(calls).toBe(after);
});
