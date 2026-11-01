import { describe, expect, it } from 'bun:test';
import { friendlyModelName, isChatModel, modelOptions } from '../lib/modelCatalog';

describe('modelCatalog curation (issue #87)', () => {
    it('strips registry/org prefixes into friendly names', () => {
        expect(friendlyModelName('mlx-community--Qwen3.8-27B-8bit')).toBe('Qwen3.8 27B 8bit');
        expect(friendlyModelName('models--Llama-3.1-8B-Instruct')).toBe('Llama 3.1 8B Instruct');
    });

    it('hides non-chat families from the default list, keeps them searchable', () => {
        const raw = [
            'mlx-community--Qwen3.8-27B-8bit',
            'bge-m3',
            'whisper-large-v3',
            'mlx-community--FLUX.1-schnell',
            'Kokoro-82M',
            'stable-diffusion-xl',
        ];
        expect(raw.filter(isChatModel)).toEqual(['mlx-community--Qwen3.8-27B-8bit']);
        const opts = modelOptions(raw, 'Default model');
        expect(opts[0]).toEqual({ value: '', label: 'Default model', curated: true });
        const curated = opts.filter((o) => o.curated !== false);
        expect(curated.map((o) => o.value)).toEqual(['', 'mlx-community--Qwen3.8-27B-8bit']);
        // Search surface: every raw id survives as the option's hint.
        for (const id of raw) {
            expect(opts.find((o) => o.value === id)?.hint).toBe(id);
        }
        expect(opts.find((o) => o.value === 'bge-m3')?.curated).toBe(false);
    });

    it('keeps a model outside the fetched list selectable (persisted prefs)', () => {
        const opts = modelOptions(['a-1'], 'Default model');
        expect(opts.find((o) => o.value === 'a-1')?.label).toBe('a 1');
        expect(opts.length).toBe(2);
    });
});
