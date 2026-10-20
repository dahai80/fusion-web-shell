import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import {
    QUICK_ACTIONS,
    buildNavCommands,
    filterCommands,
    runSearch,
    usePalette,
} from '../stores/palette';
import { useTabs } from '../stores/tabs';
import type { ModuleManifest } from '../types/manifest';

const mk = (over: Partial<ModuleManifest> & { id: string }): ModuleManifest => ({
    title: over.id,
    path: `/shell/${over.id}/`,
    entry: `/shell/${over.id}/`,
    devices: ['desktop'],
    category: 'platform',
    ...over,
});

const canAll = () => true;
const canCowork = (id: string) => id === 'fusion-cowork';

beforeEach(() => {
    localStorage.removeItem('fusion.shell.tabs');
    useTabs.setState({ tabs: [], activeTabId: null });
});

describe('buildNavCommands (G4: navigation source)', () => {
    it('emits one command per granted module plus one per sub-page', () => {
        const manifests = [
            mk({
                id: 'fusion-cowork',
                title: '工作流',
                pages: [{ route: '/runs', title: '运行', title_en: 'Runs' }],
            }),
            mk({ id: 'fusion-mlx', title: 'MLX' }),
        ];
        const cmds = buildNavCommands(manifests, canAll, 'zh');
        expect(cmds.map((c) => c.label)).toEqual(['工作流', '工作流 · 运行', 'MLX']);
        const pageCmd = cmds[1]!;
        expect(pageCmd.group).toBe('nav');
        pageCmd.run();
        const tab = useTabs.getState().tabs[0]!;
        expect(tab.src).toBe('/shell/fusion-cowork/#/runs');
    });

    it('en labels use title_en/page title_en', () => {
        const manifests = [
            mk({
                id: 'fusion-cowork',
                title: '工作流',
                title_en: 'Cowork',
                pages: [{ route: '/runs', title: '运行', title_en: 'Runs' }],
            }),
        ];
        const cmds = buildNavCommands(manifests, canAll, 'en');
        expect(cmds.map((c) => c.label)).toEqual(['Cowork', 'Cowork · Runs']);
    });

    it('skips ungranted and unreachable modules', () => {
        const manifests = [
            mk({ id: 'fusion-cowork' }),
            mk({ id: 'fusion-mlx', unreachable: true }),
            mk({ id: 'fusion-sec' }),
        ];
        const cmds = buildNavCommands(manifests, canCowork, 'zh');
        expect(cmds.map((c) => c.label)).toEqual(['fusion-cowork']);
    });
});

describe('QUICK_ACTIONS (G4: execution source)', () => {
    it('resolves only when the bound module is granted and reachable', () => {
        const manifests = [
            mk({ id: 'fusion-cowork' }),
            mk({ id: 'fusion-mlx', unreachable: true }),
        ];
        const actions = QUICK_ACTIONS.filter((a) =>
            manifests.some((m) => m.id === a.moduleId && !m.unreachable && canCowork(m.id))
        );
        expect(actions.map((a) => a.id)).toEqual(['new-workflow']);
    });
    it('action runs deep-link the bound module page', () => {
        const manifests = [mk({ id: 'fusion-mlx' })];
        const load = QUICK_ACTIONS.find((a) => a.id === 'load-model')!;
        load.run(manifests);
        const tab = useTabs.getState().tabs[0]!;
        expect(tab.manifestId).toBe('fusion-mlx');
        expect(tab.src).toContain('#/models');
    });
});

describe('filterCommands (C1: query matching)', () => {
    const cmds = [
        {
            id: 'n1',
            group: 'nav' as const,
            label: '工作流',
            keywords: 'cowork workflows',
            run: () => {},
        },
        {
            id: 'n2',
            group: 'nav' as const,
            label: 'MLX',
            keywords: 'models metrics',
            run: () => {},
        },
    ];
    it('empty query keeps all; match hits label or keywords case-insensitively', () => {
        expect(filterCommands(cmds, '')).toHaveLength(2);
        expect(filterCommands(cmds, 'work').map((c) => c.id)).toEqual(['n1']);
        expect(filterCommands(cmds, 'mlx').map((c) => c.id)).toEqual(['n2']);
        expect(filterCommands(cmds, 'METRICS').map((c) => c.id)).toEqual(['n2']);
    });
    it('no match returns empty', () => {
        expect(filterCommands(cmds, 'zzz')).toEqual([]);
    });
});

describe('runSearch (G4: cross-module search providers)', () => {
    beforeEach(() => {
        useTabs.setState({ tabs: [], activeTabId: null });
    });

    it('queries granted providers with ?q= and maps route items to commands', async () => {
        const manifests = [
            mk({
                id: 'fusion-cowork',
                title: ' cowork',
                searchProviders: [{ id: 'wf', label: '工作流', endpoint: '/api/cowork/search' }],
            }),
        ];
        const calls: string[] = [];
        const results = await runSearch(manifests, canAll, 'clean', async (path) => {
            calls.push(path);
            return {
                items: [{ title: '数据清洗', route: '/canvas?wf=7' }, { title: '无路由项' }],
            };
        });
        expect(calls).toEqual(['/api/cowork/search?q=clean']);
        expect(results).toHaveLength(2);
        expect(results[0]!.label).toBe('数据清洗');
        results[0]!.run();
        expect(useTabs.getState().tabs[0]!.src).toBe('/shell/fusion-cowork/#/canvas?wf=7');
    });

    it('provider failure is isolated: other providers still return', async () => {
        const manifests = [
            mk({
                id: 'fusion-cowork',
                title: 'cowork',
                searchProviders: [{ id: 'bad', label: 'B', endpoint: '/api/bad' }],
            }),
            mk({
                id: 'fusion-mlx',
                title: 'mlx',
                searchProviders: [{ id: 'good', label: 'G', endpoint: '/api/good' }],
            }),
        ];
        const results = await runSearch(manifests, canAll, 'q', async (path) => {
            if (path.startsWith('/api/bad')) throw new Error('boom');
            return { items: [{ title: 'ok' }] };
        });
        expect(results.map((r) => r.label)).toEqual(['ok']);
    });

    it('ungranted providers are not queried', async () => {
        const manifests = [
            mk({
                id: 'fusion-sec',
                searchProviders: [{ id: 's', label: 'S', endpoint: '/api/sec' }],
            }),
        ];
        const results = await runSearch(manifests, canCowork, 'q', async () => ({ items: [] }));
        expect(results).toEqual([]);
    });
});

describe('palette store', () => {
    it('open/close/query/active index state machine', () => {
        usePalette.getState().open();
        expect(usePalette.getState().openState).toBe(true);
        usePalette.getState().setQuery('run');
        expect(usePalette.getState().query).toBe('run');
        usePalette.getState().close();
        expect(usePalette.getState().openState).toBe(false);
        expect(usePalette.getState().query).toBe('');
    });
});
