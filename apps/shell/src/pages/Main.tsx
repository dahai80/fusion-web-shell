import { BottomNav } from '@/components/BottomNav';
import { MobileDrawer } from '@/components/MobileDrawer';
import { Sidebar } from '@/components/Sidebar';
import { TabManager } from '@/components/TabManager';
import { TabStrip } from '@/components/TabStrip';
import { pushToast } from '@/components/ToastHost';
import { t } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { getDevModules, restorePersistedTabs, useTabs } from '@/stores/tabs';
import type { ModuleManifest } from '@/types/manifest';
import { ErrorState, useAutoRetry } from '@fusion/web-ui';
import { useEffect, useRef, useState } from 'react';

interface Props {
    onLogout(): void;
}

/**
 * Shell main layout (PRD §8.1): desktop sidebar + tab strip + multi-tab area;
 * mobile bottom nav + drawer. Manifest load uses auto-retry (spec §6.1);
 * persisted tabs restore once manifests arrive (PRD §6.1).
 */
export function MainPage({ onLogout }: Props) {
    const openTab = useTabs((s) => s.openTab);
    const manifestsLoaded = useManifests((s) => s.loaded);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const restoredRef = useRef(false);

    // Auto-retry manifest load with visible attempt count (gap #7).
    const { error, attempt, loading, manualRetry } = useAutoRetry(
        () => useManifests.getState().load(true),
        []
    );

    // Restore persisted tabs (gap #2): needs manifests for entry URLs.
    useEffect(() => {
        if (!manifestsLoaded || restoredRef.current) return;
        restoredRef.current = true;
        const restored = restorePersistedTabs(useManifests.getState().manifests, getDevModules());
        if (restored > 0) {
            pushToast(
                'info',
                t(
                    `已恢复 ${restored} 个标签页，中断的流式任务可重试`,
                    `Restored ${restored} tabs; interrupted tasks can be retried`
                )
            );
        }
    }, [manifestsLoaded]);

    const handleOpen = (m: ModuleManifest) => {
        const id = openTab(m);
        if (!id) console.warn('[main] openTab refused (limit?):', m.id);
    };

    if (error && !manifestsLoaded) {
        return (
            <div className="flex h-screen items-center justify-center bg-bg text-text-primary">
                <ErrorState
                    message={error.message}
                    retrying={attempt > 0 ? attempt : undefined}
                    onRetry={loading ? undefined : manualRetry}
                />
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden bg-bg text-text-primary">
            <Sidebar onOpen={handleOpen} onLogout={onLogout} />
            <div className="flex min-w-0 flex-1 flex-col">
                <TabStrip />
                <TabManager />
                <BottomNav onOpen={handleOpen} onMore={() => setDrawerOpen(true)} />
            </div>
            <MobileDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onOpenModule={handleOpen}
                onLogout={onLogout}
            />
        </div>
    );
}
