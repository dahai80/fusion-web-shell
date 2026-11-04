import { describe, expect, it } from 'bun:test';
import { dicts, t } from '../src/i18n';

// Issue #125 AC: bilingual complete — en covers every zh key and neither
// locale falls through to the raw-key fallback.
describe('auth portal i18n (#125)', () => {
    it('en dictionary covers every zh key', () => {
        for (const key of Object.keys(dicts.zh)) {
            expect(dicts.en[key]).toBeDefined();
        }
    });

    it('both locales resolve every shared key without fallback', () => {
        for (const key of Object.keys(dicts.zh)) {
            expect(t(key, 'zh')).not.toBe(key);
            expect(t(key, 'en')).not.toBe(key);
        }
    });
});
