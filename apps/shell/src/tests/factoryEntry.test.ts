import { afterEach, describe, expect, test } from 'bun:test';
import { FACTORY_SITE_URL_ENV, factoryIntakeUrl, siteBaseUrl } from '@/lib/factoryEntry';

const ORIG = import.meta.env;

afterEach(() => {
    delete import.meta.env[FACTORY_SITE_URL_ENV];
});

describe('factoryEntry', () => {
    test('default base is the production site origin', () => {
        expect(siteBaseUrl()).toBe('https://fusion-mlx.cn');
    });

    test('build-time env overrides the base', () => {
        import.meta.env[FACTORY_SITE_URL_ENV] = 'http://127.0.0.1:3000';
        expect(siteBaseUrl()).toBe('http://127.0.0.1:3000');
    });

    test('trailing slash in override is stripped', () => {
        import.meta.env[FACTORY_SITE_URL_ENV] = 'http://127.0.0.1:3000/';
        expect(siteBaseUrl()).toBe('http://127.0.0.1:3000');
    });

    test('non-http override is rejected and falls back to default', () => {
        import.meta.env[FACTORY_SITE_URL_ENV] = 'javascript:alert(1)';
        expect(siteBaseUrl()).toBe('https://fusion-mlx.cn');
    });

    test('intake deep link targets the factory v2 single-entry flow', () => {
        expect(factoryIntakeUrl()).toBe('https://fusion-mlx.cn/factory/new');
    });

    test('intake deep link honors the override', () => {
        import.meta.env[FACTORY_SITE_URL_ENV] = 'http://127.0.0.1:3000';
        expect(factoryIntakeUrl()).toBe('http://127.0.0.1:3000/factory/new');
    });

    void ORIG;
});
