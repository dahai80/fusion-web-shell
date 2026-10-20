import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssVarName, palette, preset, radius, spacing, typography } from '../src';

const SEMANTIC_KEYS = [
    'bg',
    'bgElevated',
    'bgMuted',
    'border',
    'textPrimary',
    'textSecondary',
    'textMuted',
    'success',
    'running',
    'warning',
    'error',
    'offline',
    'brand',
] as const;

describe('@fusion/design-tokens palette', () => {
    it('covers all semantic keys in dark and light', () => {
        for (const key of SEMANTIC_KEYS) {
            expect(palette.dark[key]).toMatch(/^#[0-9a-f]{6}$/i);
            expect(palette.light[key]).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
    it('dark and light palettes differ (at least bg)', () => {
        expect(palette.dark.bg).not.toBe(palette.light.bg);
    });
    it('cssVarName maps camelCase to --fs-kebab', () => {
        expect(cssVarName('bgElevated')).toBe('--fs-bg-elevated');
        expect(cssVarName('brand')).toBe('--fs-brand');
    });
});

describe('@fusion/design-tokens primitives', () => {
    it('spacing steps are 4px multiples', () => {
        for (const value of Object.values(spacing)) {
            const px = Number.parseFloat(value) * 16;
            expect(px % 4).toBe(0);
        }
    });
    it('radius and typography expose the documented scale', () => {
        expect(radius.card).toBe('0.5rem');
        expect(typography.fontSize.base).toBe('1rem');
        expect(typography.fontFamily.sans.length).toBeGreaterThan(0);
    });
});

describe('@fusion/design-tokens css + preset', () => {
    const css = readFileSync(join(import.meta.dir, '..', 'src', 'tokens.css'), 'utf8');
    it('tokens.css declares every palette var in both modes', () => {
        for (const key of SEMANTIC_KEYS) {
            const varName = cssVarName(key);
            expect(css).toContain(`${varName}: ${palette.dark[key]}`);
            expect(css).toContain(`${varName}: ${palette.light[key]}`);
        }
        expect(css).toContain(':root');
        expect(css).toContain('html.light');
    });
    it('preset maps semantic colors to --fs-* vars', () => {
        const colors = preset.theme?.extend?.colors as Record<string, string> | undefined;
        expect(colors?.bg).toBe('var(--fs-bg)');
        expect(colors?.brand).toBe('var(--fs-brand)');
    });
});
