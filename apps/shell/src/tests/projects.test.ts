import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import { useAuth } from '../stores/auth';
import { useManifests } from '../stores/manifests';
import { setFetcher, useProjects } from '../stores/projects';
import type { ModuleManifest } from '../types/manifest';

const mk = (over: Partial<ModuleManifest> & { id: string }): ModuleManifest => ({
    title: over.id,
    path: `/shell/${over.id}/`,
    entry: `/shell/${over.id}/`,
    devices: ['desktop'],
    category: 'platform',
    ...over,
});

const projectSource = (endpoint: string) => [
    { id: 'spaces', label: '空间', label_en: 'Spaces', endpoint },
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

describe('projects/spaces feed (issue #41)', () => {
    beforeEach(() => {
        useProjects.setState({ items: [], lastGood: new Map(), polling: false });
        useManifests.setState({ manifests: [], loaded: false, unreachableIds: new Set() });
        useAuth.setState({ user: null, token: null, status: 'unknown' });
        setFetcher(async () => ({}));
    });

    it('polls only home.projects sources of reachable, granted modules', async () => {
        setupSources([
            mk({
                id: 'fusion-cowork',
                unreachable: true,
                homeProjects: projectSource('/api/cowork/spaces'),
            }),
            mk({ id: 'fusion-as', homeProjects: projectSource('/api/as/spaces') }),
            mk({ id: 'fusion-mlx' }),
        ]);
        const endpoints: string[] = [];
        setFetcher(async (path) => {
            endpoints.push(path);
            return { items: [{ id: 's1', title: '财务空间', route: '/spaces/fin' }] };
        });
        await useProjects.getState().pollNow();
        expect(endpoints).toEqual(['/api/as/spaces']);
        const items = useProjects.getState().items;
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({
            id: 'fusion-as:spaces:s1',
            moduleId: 'fusion-as',
            sourceId: 'spaces',
            itemId: 's1',
            title: '财务空间',
            route: '/spaces/fin',
        });
    });

    it('sanitizes items: drops missing id/title, rejects non-absolute or fragmented routes', async () => {
        setupSources([mk({ id: 'fusion-as', homeProjects: projectSource('/api/as/spaces') })]);
        setFetcher(async () => ({
            items: [
                {
                    id: 'ok',
                    title: '空间A',
                    route: '/spaces/a',
                    description: '说明',
                    updated_at: '2026-10-22T00:00:00Z',
                },
                { id: '', title: 'broken' },
                { title: 'no-id' },
                { id: 'bad-route', title: 'Bad', route: 'spaces/x' },
                { id: 'fragment', title: 'Bad', route: '/spaces/x#top' },
            ],
        }));
        await useProjects.getState().pollNow();
        const items = useProjects.getState().items;
        expect(items).toHaveLength(1);
        expect(items[0]!.itemId).toBe('ok');
        expect(items[0]!.description).toBe('说明');
    });

    it('keeps the last good snapshot when a source breaks (per-source isolation)', async () => {
        setupSources([
            mk({ id: 'fusion-cowork', homeProjects: projectSource('/api/cowork/spaces') }),
            mk({ id: 'fusion-as', homeProjects: projectSource('/api/as/spaces') }),
        ]);
        let coworkOk = true;
        setFetcher(async (path) => {
            if (path.includes('cowork')) {
                if (!coworkOk) throw new Error('down');
                return { items: [{ id: 'c1', title: '对账空间', route: '/spaces/close' }] };
            }
            return { items: [{ id: 'a1', title: '研究空间', route: '/spaces/research' }] };
        });
        await useProjects.getState().pollNow();
        expect(useProjects.getState().items).toHaveLength(2);
        coworkOk = false;
        await useProjects.getState().pollNow();
        const items = useProjects.getState().items;
        expect(items).toHaveLength(2);
        expect(items.find((i) => i.itemId === 'c1')).toBeDefined();
        expect(items.find((i) => i.itemId === 'a1')).toBeDefined();
    });

    it('groups items by module via byModule()', async () => {
        setupSources([
            mk({ id: 'fusion-cowork', homeProjects: projectSource('/api/cowork/spaces') }),
            mk({ id: 'fusion-as', homeProjects: projectSource('/api/as/spaces') }),
        ]);
        setFetcher(async (path) => ({
            items: [
                { id: path.includes('cowork') ? 'c1' : 'a1', title: '空间', route: '/spaces/x' },
            ],
        }));
        await useProjects.getState().pollNow();
        expect(
            useProjects
                .getState()
                .byModule('fusion-cowork')
                .map((i) => i.itemId)
        ).toEqual(['c1']);
        expect(
            useProjects
                .getState()
                .byModule('fusion-as')
                .map((i) => i.itemId)
        ).toEqual(['a1']);
        expect(useProjects.getState().byModule('fusion-mlx')).toEqual([]);
    });
});
