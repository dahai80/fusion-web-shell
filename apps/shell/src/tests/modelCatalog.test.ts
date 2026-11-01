import { describe, expect, it } from 'bun:test';
import {
    type ShellModel,
    friendlyModelName,
    isChatModel,
    isCuratedModel,
    modelOptions,
    uniqueModels,
} from '../lib/modelCatalog';

const local = (id: string, engineType: string, loaded: boolean): ShellModel => ({
    id,
    ownedBy: 'local',
    loaded,
    engineType,
});

describe('modelCatalog curation (issue #87, catalog rework #94)', () => {
    it('strips registry/org prefixes into friendly names', () => {
        expect(friendlyModelName('mlx-community--Qwen3.8-27B-8bit')).toBe('Qwen3.8 27B 8bit');
        expect(friendlyModelName('models--Llama-3.1-8B-Instruct')).toBe('Llama 3.1 8B Instruct');
    });

    it('name blocklist still hides non-chat families (search backstop)', () => {
        const raw = [
            'mlx-community--Qwen3.8-27B-8bit',
            'bge-m3',
            'whisper-large-v3',
            'mlx-community--FLUX.1-schnell',
            'Kokoro-82M',
            'stable-diffusion-xl',
        ];
        expect(raw.filter(isChatModel)).toEqual(['mlx-community--Qwen3.8-27B-8bit']);
    });

    it('chat-usable: cloud and alias always; local needs a text engine', () => {
        const cloud: ShellModel = { id: 'glm-5', ownedBy: 'cloud', loaded: false, engineType: '' };
        const alias: ShellModel = { id: 'main', ownedBy: 'alias', loaded: false, engineType: '' };
        expect(isCuratedModel(cloud)).toBe(true);
        expect(isCuratedModel(alias)).toBe(true);
        expect(isCuratedModel(local('mlx-community--Qwen3.5-4B-MLX-4bit', 'text', true))).toBe(
            true
        );
        // Embeddings and non-text engines never qualify, even when loaded.
        expect(isCuratedModel(local('BAAI--bge-m3', 'embedding', true))).toBe(false);
        expect(isCuratedModel(local('mlx-community--FLUX.1-schnell', 'image', true))).toBe(false);
        // Unloaded local models stay searchable but leave the curated list.
        expect(isCuratedModel(local('mlx-community--Qwen3.8-27B-8bit', 'text', false))).toBe(false);
    });

    it('modelOptions: default first, curated flags from the catalog, hints survive', () => {
        const models: ShellModel[] = [
            local('mlx-community--Qwen3.5-4B-MLX-4bit', 'text', true),
            local('mlx-community--Qwen3.8-27B-8bit', 'text', false),
            { id: 'glm-5', ownedBy: 'cloud', loaded: false, engineType: '' },
            local('BAAI--bge-m3', 'embedding', true),
        ];
        const opts = modelOptions(models, 'Default model');
        expect(opts[0]).toEqual({ value: '', label: 'Default model', curated: true });
        expect(opts.find((o) => o.value === 'glm-5')?.curated).toBe(true);
        expect(opts.find((o) => o.value === 'mlx-community--Qwen3.5-4B-MLX-4bit')?.curated).toBe(
            true
        );
        expect(opts.find((o) => o.value === 'mlx-community--Qwen3.8-27B-8bit')?.curated).toBe(
            false
        );
        expect(opts.find((o) => o.value === 'BAAI--bge-m3')?.curated).toBe(false);
        // Search surface: every catalog id survives as the option's hint.
        for (const m of models) {
            expect(opts.find((o) => o.value === m.id)?.hint).toBe(m.id);
        }
    });

    it('cloud label stays the raw id when nothing to strip (glm-5)', () => {
        const opts = modelOptions(
            [{ id: 'glm-5', ownedBy: 'cloud', loaded: false, engineType: '' }],
            'Default model'
        );
        expect(opts.find((o) => o.value === 'glm-5')?.label).toBe('glm 5');
        expect(opts.length).toBe(2);
    });

    it('uniqueModels collapses per-backend duplicates, merging metadata', () => {
        // Gateway emits one entry per serving backend (issue #94 live e2e:
        // 10 anthropic backends each listing the same claude-* catalog).
        const dupes: ShellModel[] = Array.from({ length: 10 }, () => ({
            id: 'claude-sonnet-4-20250514',
            ownedBy: 'anthropic',
            loaded: false,
            engineType: '',
        }));
        const merged = uniqueModels([
            ...dupes,
            local('mlx-community--Qwen3.5-4B-MLX-4bit', 'text', true),
        ]);
        expect(merged.length).toBe(2);
        const claude = merged.find((m) => m.id === 'claude-sonnet-4-20250514');
        expect(claude).toBeDefined();
        expect(isCuratedModel(claude as ShellModel)).toBe(true);
        // Sparsely-declared fields backfill from later duplicates.
        const sparse = uniqueModels([
            { id: 'x', ownedBy: '', loaded: false, engineType: '' },
            { id: 'x', ownedBy: 'cloud', loaded: true, engineType: 'text' },
        ]);
        expect(sparse.length).toBe(1);
        expect(sparse[0]).toEqual({ id: 'x', ownedBy: 'cloud', loaded: true, engineType: 'text' });
        // Merging must not mutate the input entries.
        expect(dupes.length).toBe(10);
    });
});
