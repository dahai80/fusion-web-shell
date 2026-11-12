import './setup';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TabView } from '../components/TabView';
import { useManifests } from '../stores/manifests';
import type { ShellTab } from '../stores/tabs';
import type { ModuleManifest } from '../types/manifest';

const manifest: ModuleManifest = {
    id: 'fusion-security',
    title: 'Security',
    title_en: 'Security',
    path: '/shell/fusion-security/',
    entry: '/shell/fusion-security/',
    devices: ['desktop'],
    category: 'governance',
};

const crashedTab: ShellTab = {
    id: 'fusion-security',
    manifestId: 'fusion-security',
    title: 'Security',
    status: 'crashed',
    seq: 1,
    src: null,
    hasActiveTask: false,
    crashedAt: 1700000000000,
};

describe('crashed-tab error card visibility (#149)', () => {
    it('hidden when the tab is inactive — no stacked panels', () => {
        useManifests.setState({
            manifests: [manifest],
            loaded: true,
            unreachableIds: new Set(),
        });
        const hidden = renderToStaticMarkup(
            <TabView
                tab={crashedTab}
                manifest={manifest}
                visible={false}
                onCrash={() => {}}
                onReload={() => {}}
            />
        );
        expect(hidden).toContain('hidden');
        expect(hidden).toContain('data-tab-id="fusion-security"');
        // Dismiss control present (issue #149 AC).
        expect(hidden).toContain('>关闭</button>');
        const active = renderToStaticMarkup(
            <TabView
                tab={crashedTab}
                manifest={manifest}
                visible={true}
                onCrash={() => {}}
                onReload={() => {}}
            />
        );
        expect(active).not.toContain('hidden');
    });
});
