import { describe, expect, it } from 'bun:test';
import { menuGroups } from '../stores/manifests';
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
