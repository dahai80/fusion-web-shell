import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { useAuth } from '../stores/auth';
import { useManifests } from '../stores/manifests';
import { setFetcher, setPoster, taskBucket, useTasks } from '../stores/tasks';
import type { ModuleManifest } from '../types/manifest';

const mk = (over: Partial<ModuleManifest> & { id: string }): ModuleManifest => ({
    title: over.id,
    path: `/shell/${over.id}/`,
    entry: `/shell/${over.id}/`,
    devices: ['desktop'],
    category: 'platform',
    ...over,
});

const tasksSource = (endpoint: string) => [
    { id: 'tasks', label: '任务', endpoint, kind: 'tasks' as const },
];

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

describe('task feed (issue #33)', () => {
    beforeEach(() => {
        useTasks.setState({ items: [], lastGood: new Map(), polling: false });
        useManifests.setState({ manifests: [], loaded: false, unreachableIds: new Set() });
        useAuth.setState({ user: null, token: null, status: 'unknown' });
        setFetcher(async () => ({}));
        setPoster(async () => ({}));
    });

    it('polls only kind:tasks sources and sanitizes items', async () => {
        setupSources([
            mk({
                id: 'fusion-cowork',
                notifications: [
                    ...tasksSource('/api/cowork/tasks'),
                    {
                        id: 'approvals',
                        label: '审批',
                        endpoint: '/api/cowork/appr',
                        kind: 'approvals',
                    },
                ],
            }),
        ]);
        const endpoints: string[] = [];
        setFetcher(async (path) => {
            endpoints.push(path);
            if (path.includes('/tasks')) {
                return {
                    items: [
                        {
                            id: 'run-1',
                            title: '月度对账',
                            status: 'running',
                            progress: 68,
                            updated_at: '2026-10-22T01:00:00Z',
                            route: '/runs/run-1',
                        },
                        { id: '', title: 'broken' },
                        { title: 'no-id' },
                    ],
                };
            }
            return {};
        });
        await useTasks.getState().pollNow();
        expect(endpoints).toEqual(['/api/cowork/tasks']);
        const items = useTasks.getState().items;
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({
            id: 'fusion-cowork:tasks:run-1',
            moduleId: 'fusion-cowork',
            sourceId: 'tasks',
            itemId: 'run-1',
            title: '月度对账',
            status: 'running',
            progress: 68,
            updatedAt: '2026-10-22T01:00:00Z',
            route: '/runs/run-1',
        });
    });

    it('parses pending_approval and keeps a broken source cached (per-source isolation)', async () => {
        setupSources([
            mk({ id: 'fusion-cowork', notifications: tasksSource('/api/cowork/tasks') }),
            mk({ id: 'fusion-as', notifications: tasksSource('/api/as/tasks') }),
        ]);
        let coworkOk = true;
        setFetcher(async (path) => {
            if (path.includes('cowork')) {
                if (!coworkOk) throw new Error('down');
                return {
                    items: [
                        {
                            id: 'a1',
                            title: 'PR 审查',
                            status: 'pending_approval',
                            pending_approval: {
                                endpoint: '/api/cowork/approvals/a1',
                                prompt: '允许执行 rm -rf 构建目录？',
                                risk: 'high',
                            },
                        },
                    ],
                };
            }
            return { items: [{ id: 's1', title: '图编排', status: 'running', progress: 10 }] };
        });
        await useTasks.getState().pollNow();
        expect(useTasks.getState().items).toHaveLength(2);
        const appr = useTasks.getState().items.find((i) => i.itemId === 'a1')!;
        expect(appr.pendingApproval).toEqual({
            endpoint: '/api/cowork/approvals/a1',
            prompt: '允许执行 rm -rf 构建目录？',
            risk: 'high',
        });
        // cowork breaks: its cached items survive, the other source still updates.
        coworkOk = false;
        setFetcher(async (path) => {
            if (path.includes('cowork')) throw new Error('down');
            return { items: [{ id: 's1', title: '图编排', status: 'running', progress: 20 }] };
        });
        await useTasks.getState().pollNow();
        const items = useTasks.getState().items;
        expect(items).toHaveLength(2);
        expect(items.find((i) => i.itemId === 'a1')).toBeDefined();
        expect(items.find((i) => i.itemId === 's1')!.progress).toBe(20);
    });

    it('buckets tasks into running / recent / scheduled', () => {
        expect(taskBucket({ status: 'running' } as never)).toBe('running');
        expect(taskBucket({ status: 'queued' } as never)).toBe('running');
        expect(taskBucket({ status: 'pending_approval' } as never)).toBe('running');
        expect(taskBucket({ status: 'scheduled' } as never)).toBe('scheduled');
        for (const s of ['done', 'succeeded', 'failed', 'error', 'cancelled']) {
            expect(taskBucket({ status: s } as never)).toBe('recent');
        }
    });

    it('approve posts the three-action decision and drops the resolved item', async () => {
        setupSources([
            mk({ id: 'fusion-cowork', notifications: tasksSource('/api/cowork/tasks') }),
        ]);
        setFetcher(async () => ({
            items: [
                {
                    id: 'a1',
                    title: 'PR 审查',
                    status: 'pending_approval',
                    pending_approval: { endpoint: '/api/cowork/approvals/a1' },
                },
            ],
        }));
        await useTasks.getState().pollNow();
        const posts: Array<{ path: string; body: unknown }> = [];
        setPoster(async (path, body) => {
            posts.push({ path, body });
            return {};
        });
        await useTasks.getState().approve('fusion-cowork:tasks:a1', 'allow_once');
        expect(posts).toEqual([
            { path: '/api/cowork/approvals/a1', body: { id: 'a1', action: 'allow_once' } },
        ]);
        expect(useTasks.getState().items.find((i) => i.itemId === 'a1')).toBeUndefined();
    });

    it('approve keeps the item when the module rejects the decision', async () => {
        setupSources([
            mk({ id: 'fusion-cowork', notifications: tasksSource('/api/cowork/tasks') }),
        ]);
        setFetcher(async () => ({
            items: [
                {
                    id: 'a1',
                    title: 'PR 审查',
                    status: 'pending_approval',
                    pending_approval: { endpoint: '/api/cowork/approvals/a1' },
                },
            ],
        }));
        await useTasks.getState().pollNow();
        setPoster(async () => {
            throw new Error('rejected');
        });
        await useTasks
            .getState()
            .approve('fusion-cowork:tasks:a1', 'reject')
            .catch(() => undefined);
        expect(useTasks.getState().items.find((i) => i.itemId === 'a1')).toBeDefined();
    });
});
