import { useAuth } from '@/stores/auth';
import { type Category, categoryLabel, menuGroups, useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import { useTheme } from '@/stores/theme';
import type { ModuleManifest } from '@/types/manifest';

interface Props {
    onOpen(manifest: ModuleManifest): void;
    onLogout(): void;
}

/** Desktop sidebar menu (>= md). Unreachable modules greyed, not removed (PRD §5.2). */
export function Sidebar({ onOpen, onLogout }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const unreachableIds = useManifests((s) => s.unreachableIds);
    const canView = useAuth((s) => s.canView);
    const user = useAuth((s) => s.user);
    const activeTabId = useTabs((s) => s.activeTabId);
    const tabs = useTabs((s) => s.tabs);
    const mode = useTheme((s) => s.mode);
    const toggle = useTheme((s) => s.toggle);
    const groups = menuGroups(manifests, canView, false);
    const activeManifestId = tabs.find((t) => t.id === activeTabId)?.manifestId;

    return (
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-bg-elevated md:flex">
            <div className="flex items-center justify-between px-4 py-4">
                <span className="text-lg font-medium text-text-primary">Fusion Shell</span>
                <button
                    type="button"
                    onClick={toggle}
                    className="rounded p-1 text-xs text-text-muted hover:bg-bg-muted"
                    aria-label="toggle theme"
                >
                    {mode === 'dark' ? '浅色' : '深色'}
                </button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {groups.map((g) => (
                    <div key={g.category} className="mb-3">
                        <div className="px-2 pb-1 text-xs text-text-muted">
                            {categoryLabel(g.category as Category)}
                        </div>
                        {g.items.map((m) => {
                            const unreachable = unreachableIds.has(m.id);
                            const active = activeManifestId === m.id;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    disabled={false}
                                    onClick={() => onOpen(m)}
                                    className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${active ? 'bg-brand/15 text-brand' : 'text-text-primary hover:bg-bg-muted'} ${unreachable ? 'opacity-40' : ''}`}
                                >
                                    <span className="truncate">{m.title}</span>
                                    {unreachable ? (
                                        <span className="ml-2 shrink-0 text-xs text-offline">
                                            离线
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ))}
                {groups.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-text-muted">
                        暂无被授权的模块，请联系管理员分配
                    </div>
                ) : null}
            </nav>
            <div className="border-t border-border px-4 py-3 text-xs text-text-secondary">
                <div className="truncate">{user?.display_name ?? user?.user_id}</div>
                <button
                    type="button"
                    onClick={onLogout}
                    className="mt-1 text-text-muted hover:text-error"
                >
                    退出登录
                </button>
            </div>
        </aside>
    );
}
