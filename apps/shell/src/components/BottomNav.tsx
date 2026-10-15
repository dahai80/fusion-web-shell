import { useAuth } from '@/stores/auth';
import { menuGroups, useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import type { ModuleManifest } from '@/types/manifest';

interface Props {
    onOpen(manifest: ModuleManifest): void;
    onMore(): void;
}

const MAX_PINNED = 5;

/** Mobile bottom nav (PRD §8.1): max 5 pinned entries + more drawer trigger. */
export function BottomNav({ onOpen, onMore }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const canView = useAuth((s) => s.canView);
    const groups = menuGroups(manifests, canView, true);
    const items = groups.flatMap((g) => g.items).slice(0, MAX_PINNED);
    const more = groups.flatMap((g) => g.items).length - items.length;
    const tabs = useTabs((s) => s.tabs);
    const activeTabId = useTabs((s) => s.activeTabId);
    const activeManifestId = tabs.find((t) => t.id === activeTabId)?.manifestId;

    return (
        <nav className="flex items-stretch border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)] md:hidden">
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
