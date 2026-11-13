import { describe, expect, it } from 'bun:test';
import { splitPageLayers } from '../components/Sidebar';
import type { ModulePage } from '../types/manifest';

const page = (route: string, layer?: 'dev' | 'prod'): ModulePage => ({
    route,
    title: route,
    ...(layer ? { layer } : {}),
});

describe('prod-layer page subgroup (#153)', () => {
    it('splits manifest pages into dev and prod layers', () => {
        const { dev, prod } = splitPageLayers([
            page('/'),
            page('/dashboard', 'prod'),
            page('/runs'),
            page('/governance', 'prod'),
        ]);
        expect(dev.map((p) => p.route)).toEqual(['/', '/runs']);
        expect(prod.map((p) => p.route)).toEqual(['/dashboard', '/governance']);
    });

    it('degrades to one flat list when the serving chain strips layer', () => {
        // Gateway ShellPage whitelists route/title only today (gw#660).
        const { dev, prod } = splitPageLayers([page('/'), page('/dashboard')]);
        expect(dev.length).toBe(2);
        expect(prod.length).toBe(0);
    });
});
