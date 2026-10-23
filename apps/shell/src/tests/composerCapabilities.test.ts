import { describe, expect, it } from 'bun:test';
import { composerCapabilities } from '../lib/composerCapabilities';
import type { ModuleManifest } from '../types/manifest';

const mk = (id: string, pages: ModuleManifest['pages']): ModuleManifest => ({
    id,
    title: id,
    path: `/${id}`,
    entry: `/shell/${id}/`,
    devices: ['desktop'],
    category: 'platform',
    pages,
});

const page = (route: string, title: string) => ({ route, title });

describe('composerCapabilities (issue #50 AGENT CAPABILITIES)', () => {
    it('lists pages of the delegation-target modules when registered', () => {
        const caps = composerCapabilities(
            [
                mk('fusion-cowork', [page('/workflows', '工作流'), page('/runs', '运行记录')]),
                mk('fusion-agent-studio', [page('/canvas', '画布')]),
                mk('fusion-kb', [page('/search', '搜索')]),
            ],
            'zh'
        );
        expect(caps).toEqual([
            { moduleId: 'fusion-cowork', route: '/workflows', title: '工作流' },
            { moduleId: 'fusion-cowork', route: '/runs', title: '运行记录' },
            { moduleId: 'fusion-agent-studio', route: '/canvas', title: '画布' },
        ]);
    });

    it('skips targets that are not registered or have no pages', () => {
        expect(composerCapabilities([], 'zh')).toEqual([]);
        expect(composerCapabilities([mk('fusion-cowork', [])], 'zh')).toEqual([]);
        expect(composerCapabilities([mk('fusion-kb', [page('/s', 's')])], 'zh')).toEqual([]);
    });

    it('keeps delegation-target order regardless of manifest order', () => {
        const caps = composerCapabilities(
            [
                mk('fusion-agent-studio', [page('/canvas', 'Canvas')]),
                mk('fusion-cowork', [page('/workflows', 'Workflows')]),
            ],
            'zh'
        );
        expect(caps.map((c) => c.moduleId)).toEqual(['fusion-cowork', 'fusion-agent-studio']);
    });

    it('prefers the English title when lang is en', () => {
        const caps = composerCapabilities(
            [
                mk('fusion-cowork', [
                    { route: '/workflows', title: '工作流', title_en: 'Workflows' },
                ]),
            ],
            'en'
        );
        expect(caps[0]!.title).toBe('Workflows');
        expect(
            composerCapabilities(
                [mk('fusion-cowork', [{ route: '/w', title: '工作流', title_en: 'Workflows' }])],
                'zh'
            )[0]!.title
        ).toBe('工作流');
    });
});
