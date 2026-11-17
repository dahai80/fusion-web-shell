import { describe, expect, test } from 'bun:test';
import { portalRedirectUri } from '@/lib/ssoRedirect';

describe('ssoRedirect', () => {
    test('origin-only redirect gets the trailing slash the gateway allowlist stores', () => {
        expect(portalRedirectUri('http://127.0.0.1:11432')).toBe('http://127.0.0.1:11432/');
        expect(portalRedirectUri('https://fusion-mlx.cn')).toBe('https://fusion-mlx.cn/');
    });

    test('origin with an explicit path is passed through untouched', () => {
        expect(portalRedirectUri('http://127.0.0.1:3000/login')).toBe(
            'http://127.0.0.1:3000/login'
        );
        expect(portalRedirectUri('http://127.0.0.1:11432/')).toBe('http://127.0.0.1:11432/');
    });

    test('query strings survive normalization', () => {
        expect(portalRedirectUri('http://127.0.0.1:11432/login?return=%2Fshell%2F')).toBe(
            'http://127.0.0.1:11432/login?return=%2Fshell%2F'
        );
    });
});
