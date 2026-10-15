import { useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import { useEffect, useMemo } from 'react';
import { TabView } from './TabView';

/**
 * KeepAlive container (PRD §6): every tab stays mounted; switching toggles
 * display via the hidden class only. DOM/iframe state survives switches (A3).
 */
export function TabManager() {
    const tabs = useTabs((s) => s.tabs);
    const activeTabId = useTabs((s) => s.activeTabId);
    const markCrashed = useTabs((s) => s.markCrashed);
    const restoreIframe = useTabs((s) => s.restoreIframe);
    const manifests = useManifests((s) => s.manifests);
    const byId = useMemo(() => new Map(manifests.map((m) => [m.id, m])), [manifests]);

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
            {tabs.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-text-muted">
                    从左侧菜单选择一个模块开始
                </div>
            ) : null}
        </div>
    );
}
