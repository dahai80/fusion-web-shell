import { describe, expect, it } from 'bun:test';
import {
    DESIGMA_SCHEME,
    buildLaunchUrl,
    isNativeAppModule,
    lastLaunchTs,
    stampLaunch,
} from '../lib/nativeApps';
import { useLang } from '../stores/lang';
import { newTab, srcFor } from '../stores/tabs';
import type { ModuleManifest } from '../types/manifest';

const desigma: ModuleManifest = {
    id: 'fusion-desigma',
    title: '我自己画',
    title_en: 'Self-design',
    path: '',
    entry: '/shell/fusion-desigma/',
    devices: ['desktop'],
    category: 'core',
    sort: 2,
};

const design: ModuleManifest = {
    id: 'fusion-design',
    title: 'AI 帮我画',
    title_en: 'AI Design',
    path: '',
    entry: '/shell/fusion-design/',
    devices: ['desktop'],
    category: 'core',
    sort: 1,
};

describe('native-app modules (#143)', () => {
    it('flags desigma as native, web modules not', () => {
        expect(isNativeAppModule('fusion-desigma')).toBe(true);
        expect(isNativeAppModule('fusion-design')).toBe(false);
    });

    it('native tab gets null src (launcher, no iframe); web tab keeps src', () => {
        useLang.getState().setLang('zh');
        const nativeTab = newTab(desigma, new Map(), 1);
        expect(nativeTab.src).toBeNull();
        const webTab = newTab(design, new Map(), 1);
        expect(webTab.src).toBe('/shell/fusion-design/');
    });

    it('web modules keep srcFor untouched', () => {
        expect(srcFor(design, new Map())).toBe('/shell/fusion-design/');
    });

    it('launch URL: plain scheme without token, fragment with token', () => {
        expect(buildLaunchUrl(null)).toBe(DESIGMA_SCHEME);
        expect(buildLaunchUrl(undefined)).toBe(DESIGMA_SCHEME);
        const url = buildLaunchUrl('jwt-token-abc');
        expect(url.startsWith(`${DESIGMA_SCHEME}#identity_token=`)).toBe(true);
        expect(url).toContain('jwt-token-abc');
    });

    it('launch stamp round-trips (best-effort localStorage)', () => {
        expect(lastLaunchTs()).toBeNull();
        stampLaunch();
        expect(lastLaunchTs()).not.toBeNull();
    });
});
