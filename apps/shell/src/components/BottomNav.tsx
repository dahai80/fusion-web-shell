import { useAuth } from '@/stores/auth';
import { t } from '@/stores/lang';
import { menuGroups, useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import type { ModuleManifest } from '@/types/manifest';

interface Props {
    onOpen(manifest: ModuleManifest): void;
    onMore(): void;
    onHome(): void;
}

/** 4 pinned modules + Home slot keeps the bar at 6 entries + more trigger. */
const MAX_PINNED = 4;

/** Mobile bottom nav (PRD §8.1): Home slot (issue #32) + pinned entries + more drawer. */
export function BottomNav({ onOpen, onMore, onHome }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const canView = useAuth((s) => s.canView);
    const groups = menuGroups(manifests, canView, true);
    // Groups get no bottom-nav slot (issue #71) — pinned entries are
    // top-level ungrouped modules only; grouped members live in the drawer.
    const modules = groups.flatMap((g) =>
        g.items.flatMap((e) => (e.kind === 'module' ? [e.m] : []))
    );
    const items = modules.slice(0, MAX_PINNED);
    const more = modules.length - items.length;
    const tabs = useTabs((s) => s.tabs);
    const activeTabId = useTabs((s) => s.activeTabId);
    const activeManifestId = tabs.find((t) => t.id === activeTabId)?.manifestId;
    const onHomeActive = activeTabId === null;

    return (
        <nav className="flex items-stretch border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] md:hidden">
            <button
                type="button"
                onClick={onHome}
                className={`flex min-h-[44px] flex-1 flex-col items-center justify-center px-1 py-2 text-xs ${onHomeActive ? 'text-brand' : 'text-text-secondary'}`}
                aria-current={onHomeActive ? 'page' : undefined}
            >
                <span aria-hidden>⌂</span>
                <span>{t('首页', 'Home')}</span>
            </button>
            {items.map((m) => (
                <button
                    key={m.id}
                    type="button"
                    onClick={() => onOpen(m)}
                    className={`flex min-h-[44px] flex-1 flex-col items-center justify-center px-1 py-2 text-xs ${activeManifestId === m.id ? 'text-brand' : 'text-text-secondary'}`}
                >
                    <span className="truncate text-center leading-tight">{m.title}</span>
                </button>
            ))}
            <button
                type="button"
                onClick={onMore}
                className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center px-3 py-2 text-xs text-text-secondary"
                aria-label="more"
            >
                <span>⋯</span>
                <span>更多{more > 0 ? ` (${more})` : ''}</span>
            </button>
        </nav>
    );
}
