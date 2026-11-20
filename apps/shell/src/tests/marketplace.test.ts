import { describe, expect, it } from 'bun:test';
import {
    MARKETPLACE_CATEGORIES,
    categoryCounts,
    filterPlugins,
    installStateSections,
    marketplacePlugins,
    toggleInstalled,
} from '../lib/marketplaceData';

describe('marketplace category counts (issue #174)', () => {
    it('counts per category plus the 全部 total', () => {
        const counts = categoryCounts(marketplacePlugins);
        const total = counts.get('all')!;
        expect(total).toBe(marketplacePlugins.length);
        // Every plugin's category appears with at least 1.
        for (const p of marketplacePlugins) {
            expect((counts.get(p.category) ?? 0) >= 1).toBe(true);
        }
        // Sum of category buckets equals the total (each plugin one category).
        let sum = 0;
        for (const [id, n] of counts) if (id !== 'all') sum += n;
        expect(sum).toBe(total);
    });
});

describe('marketplace search + category filter (issue #174)', () => {
    it('filters by zh title, en title, module and tag (case-insensitive)', () => {
        const rag = marketplacePlugins.find((p) => p.module === 'fusion-rag')!;
        expect(filterPlugins(marketplacePlugins, '知识检索', 'all')).toContainEqual(rag);
        expect(filterPlugins(marketplacePlugins, 'rag 检索', 'all')).toContainEqual(rag);
        expect(filterPlugins(marketplacePlugins, 'FUSION-RAG', 'all')).toContainEqual(rag);
        expect(filterPlugins(marketplacePlugins, '不存在的插件xyz', 'all')).toHaveLength(0);
    });
    it('filters by category id and combines with the query', () => {
        const devTools = filterPlugins(marketplacePlugins, '', 'dev-tools');
        expect(devTools.length).toBeGreaterThan(0);
        expect(devTools.every((p) => p.category === 'dev-tools')).toBe(true);
        const empty = filterPlugins(devTools, 'RAG', 'dev-tools');
        expect(empty).toHaveLength(0);
    });
    it('empty query + all returns everything', () => {
        expect(filterPlugins(marketplacePlugins, '', 'all')).toHaveLength(
            marketplacePlugins.length
        );
    });
});

describe('marketplace installed/updates sections (issue #174)', () => {
    it('splits installed and pending-update plugins', () => {
        const seeded = marketplacePlugins.filter((p) => p.installed);
        expect(seeded.length).toBeGreaterThan(0);
        const sections = installStateSections(marketplacePlugins);
        expect(sections.installed.length).toBe(seeded.length);
        expect(sections.updates.length).toBeGreaterThan(0);
        // Update candidates are installed AND carry a newer version.
        for (const p of sections.updates) {
            expect(p.installed).toBe(true);
            expect(p.latestVersion).toBeTruthy();
            expect(p.latestVersion).not.toBe(p.version);
        }
    });
});

describe('marketplace install toggle (issue #174, phase-1 UI state)', () => {
    it('toggleInstalled flips one plugin without mutating the input', () => {
        const before = marketplacePlugins.map((p) => p.installed ?? false);
        const next = toggleInstalled(marketplacePlugins, 'fusion-rag-ragkb');
        const target = next.find((p) => p.id === 'fusion-rag-ragkb')!;
        expect(target.installed).toBe(
            !marketplacePlugins.find((p) => p.id === 'fusion-rag-ragkb')!.installed
        );
        expect(marketplacePlugins.map((p) => p.installed ?? false)).toEqual(before);
    });
    it('unknown id is a no-op copy', () => {
        const next = toggleInstalled(marketplacePlugins, 'no-such');
        expect(next).toHaveLength(marketplacePlugins.length);
    });
});

describe('marketplace static data integrity (issue #174)', () => {
    it('every plugin has a known category and detail rows', () => {
        const ids = new Set(MARKETPLACE_CATEGORIES.map((c) => c.id));
        for (const p of marketplacePlugins) {
            expect(ids.has(p.category)).toBe(true);
            expect(p.version).toBeTruthy();
            expect(p.permissions).toBeTruthy();
            expect(p.source).toBeTruthy();
            expect(p.titleEn).toBeTruthy();
        }
    });
});
