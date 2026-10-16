import { describe, expect, it } from 'bun:test';
import { isReadonlyOnMobile, menuGroups, moduleTitle } from '../stores/manifests';
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
