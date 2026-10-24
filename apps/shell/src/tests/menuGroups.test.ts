import { describe, expect, it } from 'bun:test';
import type { ManifestDto } from '../api/endpoints';
import { syncGroupsWithActive, toggleGroupExpanded } from '../lib/sidebarTree';
import { groupAllUnreachable, groupTitle, menuGroups, useManifests } from '../stores/manifests';
import type { ModuleManifest } from '../types/manifest';

const mk = (
    id: string,
    category: ModuleManifest['category'],
    extra: Partial<ModuleManifest> = {}
): ModuleManifest => ({
    id,
    title: id,
    path: `/${id}`,
    entry: `/shell/${id}/`,
    devices: ['desktop'],
    category,
    ...extra,
});

const canAll = () => true;
const canNone = () => false;

const office = (id: string, sort?: number): ModuleManifest =>
    mk(id, 'domain', {
        group: 'fusion-office',
        group_title: 'Office 套件',
        group_title_en: 'Office Suite',
        ...(sort !== undefined ? { sort } : {}),
    });

describe('menuGroups group entries (issue #71)', () => {
    it('members sharing a group collapse into one group entry, ungrouped stay flat', () => {
        const groups = menuGroups(
            [office('docs', 2), office('sheet', 1), mk('rag', 'domain')],
            canAll,
            false
        );
        const app = groups.find((g) => g.category === 'domain');
        expect(app?.items.map((e) => e.kind)).toEqual(['module', 'group']);
        const group = app?.items.find((e) => e.kind === 'group');
        expect(group?.kind === 'group' ? group.members.map((m) => m.id) : []).toEqual([
            'sheet',
            'docs',
        ]);
    });

    it('group title is bilingual and taken from the members', () => {
        const groups = menuGroups([office('docs')], canAll, false);
        const group = groups[0]!.items[0]!;
        expect(group.kind === 'group' && groupTitle(group, 'zh')).toBe('Office 套件');
        expect(group.kind === 'group' && groupTitle(group, 'en')).toBe('Office Suite');
    });

    it('RBAC: hidden member drops out; group hides when no member is visible', () => {
        const canSheetOnly = (id: string) => id === 'sheet';
        const partial = menuGroups([office('docs'), office('sheet')], canSheetOnly, false);
        const group = partial[0]!.items[0]!;
        expect(group.kind === 'group' && group.members.map((m) => m.id)).toEqual(['sheet']);

        const empty = menuGroups([office('docs'), office('sheet')], canNone, false);
        expect(empty).toEqual([]);
    });

    it('mobile: desktop-only members excluded; group hides when all members are', () => {
        const members = [
            office('docs'),
            { ...office('sheet'), devices: ['desktop-only' as const] },
        ];
        const desktop = menuGroups(members, canAll, false);
        expect(desktop[0]!.items[0]!.kind === 'group' ? 'group' : '').toBe('group');
        const mobile = menuGroups(members, canAll, true);
        const group = mobile[0]!.items[0]!;
        expect(group.kind === 'group' && group.members.map((m) => m.id)).toEqual(['docs']);

        const allDesktopOnly = [
            { ...office('docs'), devices: ['desktop-only' as const] },
            { ...office('sheet'), devices: ['desktop-only' as const] },
        ];
        expect(menuGroups(allDesktopOnly, canAll, true)).toEqual([]);
    });
});

describe('manifest group-field sanitization (issue #71)', () => {
    const dto = (over: Partial<ManifestDto>): ManifestDto => ({
        id: 'docs',
        title: 'docs',
        path: '/docs',
        entry: '/shell/docs/',
        devices: ['desktop'],
        category: 'domain',
        ...over,
    });

    it('keeps well-formed group fields and sort', () => {
        useManifests.setState({ manifests: [], loaded: false });
        useManifests.getState().setUpstream([
            dto({
                group: 'fusion-office',
                group_title: 'Office',
                group_title_en: 'Office',
                sort: 3,
            }),
        ]);
        const m = useManifests.getState().manifests[0];
        expect(m?.group).toBe('fusion-office');
        expect(m?.group_title).toBe('Office');
        expect(m?.group_title_en).toBe('Office');
        expect(m?.sort).toBe(3);
    });

    it('drops junk: non-string group, oversized titles, non-finite sort', () => {
        useManifests.setState({ manifests: [], loaded: false });
        useManifests.getState().setUpstream([
            dto({
                group: 'x'.repeat(200) as unknown as string,
                group_title: 42 as unknown as string,
                group_title_en: 'y'.repeat(200),
                sort: Number.NaN,
            }),
        ]);
        const m = useManifests.getState().manifests[0];
        expect(m?.group).toBeUndefined();
        expect(m?.group_title).toBeUndefined();
        expect(m?.group_title_en).toBeUndefined();
        expect(m?.sort).toBeUndefined();
    });

    it('absent group fields leave the manifest ungrouped', () => {
        useManifests.setState({ manifests: [], loaded: false });
        useManifests.getState().setUpstream([dto({})]);
        expect(useManifests.getState().manifests[0]?.group).toBeUndefined();
    });
});

describe('group reachability + expansion helpers (issue #71)', () => {
    it('group greys out only when every member is unreachable', () => {
        const members = [office('docs'), office('sheet')];
        expect(groupAllUnreachable(members, new Set(['docs']))).toBe(false);
        expect(groupAllUnreachable(members, new Set(['docs', 'sheet']))).toBe(true);
        expect(groupAllUnreachable(members, new Set())).toBe(false);
    });

    it('group expansion toggles per group, independent of other groups', () => {
        const on = new Set(['a', 'b']);
        expect(toggleGroupExpanded(on, 'a')).toEqual(new Set(['b']));
        expect(toggleGroupExpanded(on, 'c')).toEqual(new Set(['a', 'b', 'c']));
        expect(toggleGroupExpanded(new Set(), 'a')).toEqual(new Set(['a']));
    });

    it('a tab focusing a group member expands its group; others keep state', () => {
        const prev = new Set(['other']);
        const next = syncGroupsWithActive(prev, 'docs', [office('docs'), office('sheet')]);
        expect(next.has('fusion-office')).toBe(true);
        expect(next.has('other')).toBe(true);
        // No active tab: unchanged.
        expect(syncGroupsWithActive(prev, null, [office('docs')])).toEqual(prev);
    });
});
