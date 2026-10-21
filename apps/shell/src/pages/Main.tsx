import { BottomNav } from '@/components/BottomNav';
import { CommandPalette } from '@/components/CommandPalette';
import { MobileDrawer } from '@/components/MobileDrawer';
import { Sidebar } from '@/components/Sidebar';
import { TabManager } from '@/components/TabManager';
import { TabStrip } from '@/components/TabStrip';
import { pushToast } from '@/components/ToastHost';
import { t } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { useNotifications } from '@/stores/notifications';
import { getDevModules, restorePersistedTabs, useTabs } from '@/stores/tabs';
import type { ModuleManifest } from '@/types/manifest';
import { ErrorState, useAutoRetry } from '@fusion/web-ui';
import { useEffect, useRef, useState } from 'react';

interface Props {
    onLogout(): void;
}

const NOTIFICATIONS_POLL_MS = 30000;

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

    // Notification center (issue #24): poll manifest-declared sources over the
    // existing gateway surface. Re-poll once manifests change (new sources).
    useEffect(() => {
        if (!manifestsLoaded) return;
        const store = useNotifications.getState();
        if (!store.polling) void store.start(NOTIFICATIONS_POLL_MS);
        else void store.pollNow();
        return () => useNotifications.getState().stop();
    }, [manifestsLoaded]);

    const handleOpen = (m: ModuleManifest, route?: string, pageTitle?: string) => {
        const id = openTab(m, { route, pageTitle });
        if (!id) console.warn('[main] openTab refused (limit?):', m.id);
    };

    // First-load failure / retry UX (spec 6.1): show "第 N 次重试中" during
    // backoff, and the manual retry button once auto-retry is exhausted.
    if (!manifestsLoaded && (error || attempt > 0)) {
        return (
            <div className="flex h-screen items-center justify-center bg-bg text-text-primary">
                <ErrorState
                    message={error?.message ?? t('连接服务中…', 'Connecting to services…')}
                    retrying={loading && attempt > 0 ? attempt : undefined}
                    onRetry={!loading && error ? manualRetry : undefined}
                />
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden bg-bg text-text-primary">
            <Sidebar onOpen={handleOpen} onLogout={onLogout} />
            <div className="flex min-w-0 flex-1 flex-col">
                <TabStrip />
                <TabManager onOpen={handleOpen} />
                <BottomNav
                    onOpen={handleOpen}
                    onMore={() => setDrawerOpen(true)}
                    onHome={() => useTabs.getState().goHome()}
                />
            </div>
            <MobileDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onOpenModule={handleOpen}
                onLogout={onLogout}
            />
            <CommandPalette />
        </div>
    );
}
