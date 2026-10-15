import { BottomNav } from '@/components/BottomNav';
import { MobileDrawer } from '@/components/MobileDrawer';
import { Sidebar } from '@/components/Sidebar';
import { TabManager } from '@/components/TabManager';
import { useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import type { ModuleManifest } from '@/types/manifest';
import { useEffect, useState } from 'react';

interface Props {
    onLogout(): void;
}

/** Shell main layout: desktop sidebar + multi-tab; mobile bottom nav + drawer (PRD §8.1). */
export function MainPage({ onLogout }: Props) {
    const openTab = useTabs((s) => s.openTab);
    const loadManifests = useManifests((s) => s.load);
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        void loadManifests();
    }, [loadManifests]);

    const handleOpen = (m: ModuleManifest) => {
        const id = openTab(m);
        if (!id) console.warn('[main] openTab refused (limit?):', m.id);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-bg text-text-primary">
            <Sidebar onOpen={handleOpen} onLogout={onLogout} />
            <div className="flex min-w-0 flex-1 flex-col">
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
