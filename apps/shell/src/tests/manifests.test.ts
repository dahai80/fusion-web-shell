import { describe, expect, it } from 'bun:test';
import type { ManifestDto } from '../api/endpoints';
import { isReadonlyOnMobile, menuGroups, moduleTitle, useManifests } from '../stores/manifests';
import type { ModuleManifest } from '../types/manifest';

const mk = (
    id: string,
    category: ModuleManifest['category'],
    devices: ModuleManifest['devices']
): ModuleManifest => ({
    id,
    title: id,
    path: `/${id}`,
    entry: `/shell/${id}/`,
    devices,
    category,
});

const canAdmin = () => true;
const canNone = () => false;

describe('menuGroups', () => {
    it('groups by category in fixed order', () => {
        const groups = menuGroups(
            [
                mk('c', 'dev', ['desktop']),
                mk('a', 'platform', ['desktop']),
                mk('b', 'platform', ['desktop']),
            ],
            canAdmin,
            false
        );
        expect(groups.map((g) => g.category)).toEqual(['platform', 'dev']);
        expect(groups[0]!.items.map((i) => i.id)).toEqual(['a', 'b']);
    });
    it('filters by RBAC: nothing granted -> empty menu (A9)', () => {
        const groups = menuGroups([mk('a', 'platform', ['desktop'])], canNone, false);
        expect(groups).toEqual([]);
    });
    it('hides desktop-only modules on mobile, keeps on desktop (A10)', () => {
        const list = [
            mk('sec', 'infra', ['desktop-only']),
            mk('mlx', 'platform', ['desktop', 'mobile-readonly']),
        ];
        expect(
            menuGroups(list, canAdmin, false)
                .flatMap((g) => g.items)
                .map((i) => i.id)
        ).toEqual(['mlx', 'sec']);
        expect(
            menuGroups(list, canAdmin, true)
                .flatMap((g) => g.items)
                .map((i) => i.id)
        ).toEqual(['mlx']);
    });
});

describe('i18n (gaps #5/#6)', () => {
    it('moduleTitle uses title_en in en, zh title otherwise', () => {
        const m: ModuleManifest = { ...mk('mlx', 'platform', ['desktop']), title_en: 'MLX Engine' };
        expect(moduleTitle(m, 'en')).toBe('MLX Engine');
        expect(moduleTitle(m, 'zh')).toBe('mlx');
        expect(moduleTitle({ ...m, title_en: undefined }, 'en')).toBe('mlx');
    });
    it('menuGroups uses English labels in en', () => {
        const en = mk('mlx', 'platform', ['desktop']);
        const groups = menuGroups([en], () => true, false, 'en');
        expect(groups[0]!.label).toBe('Platform');
        expect(groups[0]!.items[0]!.id).toBe('mlx');
    });
});

describe('isReadonlyOnMobile (issue #21, spec §8.2)', () => {
    it('forces view-only on mobile for mobile-readonly modules', () => {
        expect(isReadonlyOnMobile(['desktop', 'mobile-readonly'], 'mobile')).toBe(true);
    });
    it('leaves mobile-readonly modules interactive on desktop', () => {
        expect(isReadonlyOnMobile(['desktop', 'mobile-readonly'], 'desktop')).toBe(false);
    });
    it('never gates mobile-ready / desktop-only manifests', () => {
        expect(isReadonlyOnMobile(['desktop', 'mobile-ready'], 'mobile')).toBe(false);
        expect(isReadonlyOnMobile(['desktop-only'], 'mobile')).toBe(false);
        expect(isReadonlyOnMobile([], 'mobile')).toBe(false);
    });
});

describe('manifest ext fields (issue #24: searchProviders/pages/notifications)', () => {
    const reset = () => {
        useManifests.setState({ manifests: [], loaded: false, unreachableIds: new Set() });
    };

    it('parses valid searchProviders/pages/notifications', () => {
        reset();
        useManifests.getState().setUpstream([
            {
                id: 'fusion-cowork',
                title: ' cowork',
                path: '/shell/fusion-cowork/',
                entry: '/shell/fusion-cowork/',
                devices: ['desktop'],
                category: 'platform',
                searchProviders: [
                    {
                        id: 'workflows',
                        label: '工作流',
                        label_en: 'Workflows',
                        endpoint: '/api/cowork/search',
                    },
                ],
                pages: [{ route: '/runs', title: '运行', title_en: 'Runs' }],
                notifications: [
                    {
                        id: 'approvals',
                        label: '审批',
                        endpoint: '/api/cowork/approvals',
                        kind: 'approvals',
                    },
                ],
            } as unknown as ManifestDto,
        ]);
        const m = useManifests.getState().manifests[0]!;
        expect(m.searchProviders).toEqual([
            {
                id: 'workflows',
                label: '工作流',
                label_en: 'Workflows',
                endpoint: '/api/cowork/search',
            },
        ]);
        expect(m.pages).toEqual([{ route: '/runs', title: '运行', title_en: 'Runs' }]);
        expect(m.notifications).toEqual([
            {
                id: 'approvals',
                label: '审批',
                endpoint: '/api/cowork/approvals',
                kind: 'approvals',
            },
        ]);
    });

    it('drops invalid ext entries and absent fields stay undefined', () => {
        reset();
        useManifests.getState().setUpstream([
            {
                id: 'fusion-as',
                title: 'as',
                path: '/shell/fusion-as/',
                entry: '/shell/fusion-as/',
                devices: ['desktop'],
                category: 'platform',
                searchProviders: [
                    null,
                    { id: '', endpoint: '/x' },
                    { id: 'ok', label: 'OK', endpoint: 'not-absolute' },
                    { id: 'good', label: 'Good', endpoint: '/api/as/search' },
                ],
                pages: [
                    { route: 'no-slash', title: 'Bad' },
                    { route: '/ok', title: 'Ok' },
                ],
                notifications: [{ id: 'n1', label: 'x', endpoint: '/api/x', kind: 'bogus' }],
            } as unknown as ManifestDto,
        ]);
        const m = useManifests.getState().manifests[0]!;
        expect(m.searchProviders).toEqual([
            { id: 'good', label: 'Good', endpoint: '/api/as/search' },
        ]);
        expect(m.pages).toEqual([{ route: '/ok', title: 'Ok' }]);
        expect(m.notifications).toBeUndefined();
    });

    it('dedupes ext ids and menuGroups is unchanged without ext fields', () => {
        reset();
        useManifests.getState().setUpstream([
            {
                id: 'fusion-mlx',
                title: 'mlx',
                path: '/shell/fusion-mlx/',
                entry: '/shell/fusion-mlx/',
                devices: ['desktop'],
                category: 'platform',
                searchProviders: [
                    { id: 'a', label: 'A', endpoint: '/1' },
                    { id: 'a', label: 'B', endpoint: '/2' },
                ],
            } as unknown as ManifestDto,
        ]);
        const m = useManifests.getState().manifests[0]!;
        expect(m.searchProviders).toHaveLength(1);
        expect(m.searchProviders![0]!.label).toBe('A');
        const groups = menuGroups(useManifests.getState().manifests, () => true, false);
        expect(groups).toHaveLength(1);
    });
});

describe('manifest home cards (issue #32)', () => {
    const reset = () => {
        useManifests.setState({ manifests: [], loaded: false, unreachableIds: new Set() });
    };

    it('parses valid home cards with bilingual fields and chip flag', () => {
        reset();
        useManifests.getState().setUpstream([
            {
                id: 'fusion-cowork',
                title: 'cowork',
                path: '/shell/fusion-cowork/',
                entry: '/shell/fusion-cowork/',
                devices: ['desktop'],
                category: 'platform',
                home: {
                    cards: [
                        {
                            id: 'monthly-close',
                            title: '月度对账',
                            title_en: 'Monthly close',
                            description: '对账并生成报告',
                            description_en: 'Reconcile and report',
                            route: '/workflows/monthly-close',
                            chip: true,
                        },
                    ],
                },
            } as unknown as ManifestDto,
        ]);
        const m = useManifests.getState().manifests[0]!;
        expect(m.home).toEqual([
            {
                id: 'monthly-close',
                title: '月度对账',
                title_en: 'Monthly close',
                description: '对账并生成报告',
                description_en: 'Reconcile and report',
                route: '/workflows/monthly-close',
                chip: true,
            },
        ]);
    });

    it('drops invalid home cards, dedupes by id, keeps absent home undefined', () => {
        reset();
        const cards = [
            { id: 'no-title', route: '/x' },
            { id: 'bad-route', title: 'Bad', route: 'no-slash' },
            { id: 'fragment', title: 'Bad', route: '/x#top' },
            { id: 'dup', title: 'One', route: '/one' },
            { id: 'dup', title: 'Two', route: '/two' },
            { id: 'ok', title: 'Ok', route: '/ok' },
        ];
        useManifests.getState().setUpstream([
            {
                id: 'fusion-as',
                title: 'as',
                path: '/shell/fusion-as/',
                entry: '/shell/fusion-as/',
                devices: ['desktop'],
                category: 'platform',
                home: { cards },
            } as unknown as ManifestDto,
            {
                id: 'fusion-mlx',
                title: 'mlx',
                path: '/shell/fusion-mlx/',
                entry: '/shell/fusion-mlx/',
                devices: ['desktop'],
                category: 'platform',
            } as unknown as ManifestDto,
        ]);
        const [as, mlx] = useManifests.getState().manifests;
        expect(as!.home).toEqual([
            { id: 'dup', title: 'One', route: '/one' },
            { id: 'ok', title: 'Ok', route: '/ok' },
        ]);
        expect(mlx!.home).toBeUndefined();
    });

    it('caps home cards at 32 entries', () => {
        reset();
        const cards = Array.from({ length: 40 }, (_, i) => ({
            id: `c${i}`,
            title: `C${i}`,
            route: `/c${i}`,
        }));
        useManifests.getState().setUpstream([
            {
                id: 'fusion-hub',
                title: 'hub',
                path: '/shell/fusion-hub/',
                entry: '/shell/fusion-hub/',
                devices: ['desktop'],
                category: 'platform',
                home: { cards },
            } as unknown as ManifestDto,
        ]);
        const m = useManifests.getState().manifests[0]!;
        expect(m.home).toHaveLength(32);
        expect(m.home![0]!.id).toBe('c0');
    });
});
