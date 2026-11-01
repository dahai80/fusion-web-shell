import './domSetup';
import { describe, expect, it } from 'bun:test';
import { computeEngineOffline } from '../pages/Home';
import type { ModuleManifest } from '../types/manifest';

const engine: ModuleManifest = {
    id: 'fusion-mlx',
    title: '推理引擎',
    path: '/shell/fusion-mlx/',
    entry: '/shell/fusion-mlx/',
    devices: ['desktop'],
    category: 'platform',
    unreachable: false,
};

describe('Home engine-offline verdict (issue #93)', () => {
    it('never warns while manifests are still loading (first-paint flash)', () => {
        expect(computeEngineOffline(undefined, new Set(), false)).toBe(false);
        expect(computeEngineOffline(engine, new Set(['fusion-mlx']), false)).toBe(false);
    });

    it('warns once loaded and the engine entry is missing', () => {
        expect(computeEngineOffline(undefined, new Set(), true)).toBe(true);
    });

    it('warns on the client-side unreachable mark; healthy engine stays silent', () => {
        expect(computeEngineOffline(engine, new Set(['fusion-mlx']), true)).toBe(true);
        expect(computeEngineOffline(engine, new Set(), true)).toBe(false);
    });
});
