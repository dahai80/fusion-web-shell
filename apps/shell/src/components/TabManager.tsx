import { HomePage } from '@/pages/Home';
import { useLang } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import type { ModuleManifest } from '@/types/manifest';
import { useEffect, useMemo } from 'react';
import { TabView } from './TabView';

interface Props {
    onOpen(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
}

/**
 * KeepAlive container (PRD §6): every tab stays mounted; switching toggles
 * display via the hidden class only. DOM/iframe state survives switches (A3).
 * No active tab = Home landing (issue #32).
 */
export function TabManager({ onOpen }: Props) {
    const tabs = useTabs((s) => s.tabs);
    const activeTabId = useTabs((s) => s.activeTabId);
    const markCrashed = useTabs((s) => s.markCrashed);
    const restoreIframe = useTabs((s) => s.restoreIframe);
    const manifests = useManifests((s) => s.manifests);
    const byId = useMemo(() => new Map(manifests.map((m) => [m.id, m])), [manifests]);
    // Subscribe so t() re-renders on language switch.
    useLang((l) => l.lang);

    // Hidden tabs keep running (display:none) so streaming SSE/ws continues (PRD §6.2).
    useEffect(() => {
        console.log('[tab-manager] mounted tabs:', tabs.map((t) => t.id).join(','));
    }, [tabs]);

    return (
        <div className="relative h-full min-h-0 flex-1">
            {tabs.map((tab) => (
                <TabView
                    key={tab.id}
                    tab={tab}
                    manifest={byId.get(tab.manifestId)}
                    visible={tab.id === activeTabId}
                    onCrash={markCrashed}
                    onReload={() => restoreIframe(byId.get(tab.manifestId)!)}
                />
            ))}
            {activeTabId === null ? <HomePage onOpen={onOpen} /> : null}
        </div>
    );
}
