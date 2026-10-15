import { useAuth } from '@/stores/auth';
import { type Category, categoryLabel, menuGroups, useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import { useTheme } from '@/stores/theme';
import type { ModuleManifest } from '@/types/manifest';

interface Props {
    open: boolean;
    onClose(): void;
    onOpenModule(manifest: ModuleManifest): void;
    onLogout(): void;
}

/**
 * Mobile drawer: module list (more entries beyond 5 pinned) + open-tab list for
 * tab switching. KeepAlive preserved — switching tabs never unmounts (PRD §8.1).
 */
export function MobileDrawer({ open, onClose, onOpenModule, onLogout }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const unreachableIds = useManifests((s) => s.unreachableIds);
    const canView = useAuth((s) => s.canView);
    const user = useAuth((s) => s.user);
    const mode = useTheme((s) => s.mode);
    const toggleTheme = useTheme((s) => s.toggle);
    const tabs = useTabs((s) => s.tabs);
    const activeTabId = useTabs((s) => s.activeTabId);
    const activateTab = useTabs((s) => s.activateTab);
    const groups = menuGroups(manifests, canView, true);

    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 md:hidden"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)]">
                {tabs.length > 0 ? (
                    <div className="border-b border-border px-4 py-3">
                        <div className="pb-1 text-xs text-text-muted">已打开</div>
                        <div className="flex flex-wrap gap-2">
                            {tabs.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                        activateTab(t.id);
                                        onClose();
                                    }}
                                    className={`min-h-[44px] rounded-md border px-3 text-sm ${t.id === activeTabId ? 'border-brand text-brand' : 'border-border text-text-primary'} ${t.status === 'crashed' ? 'opacity-50' : ''}`}
                                >
                                    {t.title}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
                {groups.map((g) => (
                    <div key={g.category} className="px-4 py-3">
                        <div className="pb-1 text-xs text-text-muted">
                            {categoryLabel(g.category as Category)}
                        </div>
                        {g.items.map((m) => {
                            const unreachable = unreachableIds.has(m.id);
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                        onOpenModule(m);
                                        onClose();
                                    }}
                                    className={`flex min-h-[44px] w-full items-center justify-between text-left text-sm ${m.id === activeTabId ? 'text-brand' : 'text-text-primary'} ${unreachable ? 'opacity-40' : ''}`}
                                >
                                    <span>{m.title}</span>
                                    {unreachable ? (
                                        <span className="text-xs text-offline">离线</span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ))}
                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                    <span className="text-text-secondary">
                        {user?.display_name ?? user?.user_id}
                    </span>
                    <span className="flex gap-4">
                        <button type="button" onClick={toggleTheme} className="text-text-muted">
                            {mode === 'dark' ? '浅色' : '深色'}
                        </button>
                        <button type="button" onClick={onLogout} className="text-text-muted">
                            退出
                        </button>
                    </span>
                </div>
            </div>
        </div>
    );
}
