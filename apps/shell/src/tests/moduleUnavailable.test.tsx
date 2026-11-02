import './setup';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModuleUnavailablePage } from '../components/ModuleUnavailable';
import { useManifests } from '../stores/manifests';
import type { ModuleManifest } from '../types/manifest';

const mk = (unreachable: boolean): ModuleManifest => ({
    id: 'fusion-cowork',
    title: 'Cowork',
    title_en: 'Cowork',
    path: '/shell/fusion-cowork/',
    entry: '/shell/fusion-cowork/',
    devices: ['desktop'],
    category: 'platform',
    unreachable,
});

describe('ModuleUnavailablePage (issue #100, MT-D)', () => {
    it('renders module name, offline notice and a retry button', () => {
        useManifests.setState({ manifests: [], loaded: true, unreachableIds: new Set() });
        const html = renderToStaticMarkup(
            <ModuleUnavailablePage manifest={mk(true)} onProbed={() => {}} />
        );
        expect(html).toContain('data-testid="module-unavailable"');
        expect(html).toContain('Cowork');
        expect(html).toContain('模块暂不可用');
        expect(html).toContain('>重试</button>');
        expect(html).not.toContain('仍不可用');
    });

    it('retry stays enabled in the initial state (probing is user-driven)', () => {
        const html = renderToStaticMarkup(
            <ModuleUnavailablePage manifest={mk(true)} onProbed={() => {}} />
        );
        expect(html).not.toContain('disabled=""');
    });
});
