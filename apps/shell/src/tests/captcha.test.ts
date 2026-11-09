import { afterEach, describe, expect, it } from 'bun:test';
import {
    fetchCaptchaChallenge,
    isCaptchaError,
    parseChallenge,
    setCaptchaGetter,
} from '../lib/captcha';

afterEach(() => {
    setCaptchaGetter(() => Promise.reject(new Error('no getter')));
});

describe('captcha lib (#139)', () => {
    it('parses data-URI image challenge', () => {
        const c = parseChallenge({
            captcha_id: 'c1',
            image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
            ttl_seconds: 300,
        });
        expect(c?.captchaId).toBe('c1');
        expect(c?.imageDataUri.startsWith('data:image/')).toBe(true);
        expect(c?.ttlSeconds).toBe(300);
    });

    it('wraps raw svg payloads into a data URI', () => {
        const c = parseChallenge({ captcha_id: 'c2', image_svg: '<svg>code</svg>' });
        expect(c?.imageDataUri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    });

    it('rejects malformed challenges (missing id or image)', () => {
        expect(parseChallenge({ captcha_id: 'c3' })).toBeNull();
        expect(parseChallenge({ image: 'data:image/png;base64,x' })).toBeNull();
        expect(parseChallenge(null)).toBeNull();
    });

    it('degrades to null on endpoint failure (404/401/5xx)', async () => {
        setCaptchaGetter(() => Promise.reject(Object.assign(new Error('nf'), { status: 404 })));
        expect(await fetchCaptchaChallenge()).toBeNull();
        setCaptchaGetter(() => Promise.reject(Object.assign(new Error('auth'), { status: 401 })));
        expect(await fetchCaptchaChallenge()).toBeNull();
    });

    it('surfaces well-shaped challenges through the getter seam', async () => {
        setCaptchaGetter(() =>
            Promise.resolve({ captcha_id: 'ok', image: 'data:image/svg+xml;base64,AAAA' })
        );
        const c = await fetchCaptchaChallenge();
        expect(c?.captchaId).toBe('ok');
    });

    it('isCaptchaError detects captcha_* codes, direct or enveloped', () => {
        expect(isCaptchaError(new Error('x'))).toBe(false);
        expect(isCaptchaError(Object.assign(new Error('x'), { code: 'captcha_expired' }))).toBe(
            true
        );
        expect(
            isCaptchaError(
                Object.assign(new Error('x'), { envelope: { code: 'captcha_mismatch' } })
            )
        ).toBe(true);
    });
});

describe('captcha lib — gateway #592 live shape', () => {
    it('wraps raw SVG delivered in the image field', () => {
        const c = parseChallenge({
            captcha_id: 'g1',
            image: '<svg xmlns="http://www.w3.org/2000/svg">code</svg>',
            ttl_seconds: 300,
            enabled: true,
        });
        expect(c?.captchaId).toBe('g1');
        expect(c?.imageDataUri.startsWith('data:image/svg+xml;utf8,%3Csvg')).toBe(true);
    });

    it('enabled:false without challenge fields parses to null', () => {
        expect(parseChallenge({ enabled: false })).toBeNull();
    });
});
