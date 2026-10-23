import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { radius, shadow } from '@fusion/design-tokens';

const css = readFileSync(join(import.meta.dir, '..', 'src', 'tokens.css'), 'utf8');

describe('@fusion/web-ui interaction-layer classes (issue #56)', () => {
    it('elevation classes pair with the design-token shadows', () => {
        expect(css).toContain(`.fs-elev-1 {\n    box-shadow: ${shadow.elev1};`);
        expect(css).toContain(`.fs-elev-2 {\n    box-shadow: ${shadow.elev2};`);
    });
    it('button levels pin to ONE radius token (set once on the base class)', () => {
        const levelBlocks = css.match(/\.fs-btn-(primary|secondary|ghost|danger) \{[^}]*\}/g) ?? [];
        expect(levelBlocks.length).toBe(4);
        for (const block of levelBlocks) {
            expect(block).not.toContain('border-radius');
        }
        expect(css.match(/border-radius: var\(--fs-radius-card\);/g)?.length).toBe(1);
        expect(radius.card).toBe('0.5rem');
    });
    it('button levels carry no hardcoded theme colors', () => {
        const btnSection = css.slice(css.indexOf('.fs-btn'));
        const hexes = btnSection.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
        expect(hexes.every((h) => h.toLowerCase() === '#ffffff' || h.toLowerCase() === '#000000')).toBe(true);
    });
    it('base button class defines the shared padding/typography once', () => {
        expect(css).toContain('padding: 0.375rem 0.75rem');
        expect(css).toContain('font-size: 0.875rem');
    });
});
