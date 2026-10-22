import { NotificationBell } from '@/components/NotificationBell';
import { useAuth } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import { menuGroups, moduleTitle, useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import { useTheme } from '@/stores/theme';
import type { ModuleManifest } from '@/types/manifest';
import { TabCloseButton } from './TabCloseButton';

interface Props {
    open: boolean;
    onClose(): void;
    onOpenModule(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
    onLogout(): void;
}

/**
 * Mobile drawer (PRD §8.1): open-tab list (switchable, closeable, KeepAlive
 * preserved) + module list beyond the 5 pinned bottom-nav entries. Bilingual.
 */
export function MobileDrawer({ open, onClose, onOpenModule, onLogout }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const unreachableIds = useManifests((s) => s.unreachableIds);
    const canView = useAuth((s) => s.canView);
    const user = useAuth((s) => s.user);
    const mode = useTheme((s) => s.mode);
    const toggleTheme = useTheme((s) => s.toggle);
    const lang = useLang((s) => s.lang);
    const setLang = useLang((s) => s.setLang);
    const tabs = useTabs((s) => s.tabs);
    const activeTabId = useTabs((s) => s.activeTabId);
    const activateTab = useTabs((s) => s.activateTab);
    const groups = menuGroups(manifests, canView, true, lang);

    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 md:hidden"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-border bg-bg-elevated pb-[env(safe-area-inset-bottom)]">
                {tabs.length > 0 ? (
                    <div className="border-b border-border px-4 py-3">
                        <div className="pb-1 text-xs text-text-muted">
                            {t('已打开', 'Open tabs')}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {tabs.map((tb) => (
                                <span
                                    key={tb.id}
                                    className={`flex min-h-[44px] items-center gap-1 rounded-md border px-2 text-sm ${tb.id === activeTabId ? 'border-brand text-brand' : 'border-border text-text-primary'} ${tb.status === 'crashed' ? 'opacity-50' : ''}`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            activateTab(tb.id);
                                            onClose();
                                        }}
                                        className="py-2"
                                    >
                                        {tb.title}
                                        {tb.interrupted ? ' ↻' : ''}
                                        {tb.status === 'crashed' ? ' ●' : ''}
                                    </button>
                                    <TabCloseButton
                                        tabId={tb.id}
                                        tabTitle={tb.title}
                                        hasActiveTask={tb.hasActiveTask}
                                        className="px-1 text-text-muted"
                                    />
                                </span>
                            ))}
                        </div>
                    </div>
                ) : null}
                {groups.map((g) => (
                    <div key={g.category} className="px-4 py-3">
                        <div className="pb-1 text-xs text-text-muted">{g.label}</div>
                        {g.items.map((m) => {
                            const unreachable = unreachableIds.has(m.id);
                            return (
                                <div key={m.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onOpenModule(m);
                                            onClose();
                                        }}
                                        className={`flex min-h-[44px] w-full items-center justify-between text-left text-sm ${m.id === activeTabId ? 'text-brand' : 'text-text-primary'} ${unreachable ? 'opacity-40' : ''}`}
                                    >
                                        <span>{moduleTitle(m, lang)}</span>
                                        {unreachable ? (
                                            <span className="text-xs text-offline">
                                                {t('离线', 'Offline')}
                                            </span>
                                        ) : null}
                                    </button>
                                    {(m.pages ?? []).map((page) => {
                                        const pageTitle =
                                            lang === 'en' && page.title_en
                                                ? page.title_en
                                                : page.title;
                                        return (
                                            <button
                                                key={`${m.id}:${page.route}`}
                                                type="button"
                                                onClick={() => {
                                                    onOpenModule(m, page.route, pageTitle);
                                                    onClose();
                                                }}
                                                className="flex min-h-[44px] w-full items-center rounded-md pl-8 text-left text-sm text-text-secondary"
                                            >
                                                <span className="truncate">{pageTitle}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                ))}
                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                    <span className="text-text-secondary">
                        {user?.display_name ?? user?.user_id}
                    </span>
                    <span className="flex gap-4">
                        <NotificationBell />
                        <button
                            type="button"
                            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                            className="text-text-muted"
                        >
                            {lang === 'zh' ? 'EN' : '中文'}
                        </button>
                        <button type="button" onClick={toggleTheme} className="text-text-muted">
                            {mode === 'dark' ? t('浅色', 'Light') : t('深色', 'Dark')}
                        </button>
                        <button type="button" onClick={onLogout} className="text-text-muted">
                            {t('退出', 'Exit')}
                        </button>
                    </span>
                </div>
            </div>
        </div>
    );
}
