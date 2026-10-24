import { NotificationBell } from '@/components/NotificationBell';
import { navigateShell, pathForAdminPage } from '@/lib/adminRoute';
import {
    isPageActive,
    rowClickIntent,
    syncExpandedWithActive,
    syncGroupsWithActive,
    toggleExpanded,
} from '@/lib/sidebarTree';
import { useAuth } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import {
    groupAllUnreachable,
    groupTitle,
    menuGroups,
    moduleTitle,
    useManifests,
} from '@/stores/manifests';
import { usePalette } from '@/stores/palette';
import { usePrefs } from '@/stores/prefs';
import { useTabs } from '@/stores/tabs';
import { useTheme } from '@/stores/theme';
import type { ModuleManifest } from '@/types/manifest';
import { useEffect, useState } from 'react';

interface Props {
    onOpen(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
    onLogout(): void;
}

/**
 * Sidebar type scale (issue #53): one tier per hierarchy level, all
 * token-driven. L2 pages are 13px with a single gray for idle and a brand
 * active state; affix buttons share one size; offline uses the offline
 * token instead of opacity graying.
 */
const TYPE_SCALE = {
    brand: 'text-lg font-medium text-text-primary',
    iconBtn: 'rounded p-1 text-xs text-text-muted hover:bg-bg-muted',
    groupLabel: 'px-2 pb-1 text-xs text-text-muted',
    l1: 'text-sm',
    l1Idle: 'text-text-primary hover:bg-bg-muted',
    l1Active: 'bg-brand/15 text-brand',
    l2: 'text-[13px] hover:bg-bg-muted hover:text-text-primary',
    l2Idle: 'text-text-secondary',
    l2Active: 'text-brand hover:text-brand',
    affix: 'text-xs text-text-muted hover:bg-bg-muted hover:text-brand',
    offline: 'text-offline',
} as const;

/**
 * Desktop sidebar menu (>= md), two-level per issue #46: level 1 = product
 * (accordion row, click opens its default page), level 2 = the product's
 * manifest pages, expanded one product at a time. The active product
 * auto-expands when a tab focuses it. Unreachable modules greyed, not
 * removed (PRD §5.2). "+" re-opens an already-open module as a second
 * instance (PRD §6 multi-instance). Bilingual per spec S9.
 */
export function Sidebar({ onOpen, onLogout }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const unreachableIds = useManifests((s) => s.unreachableIds);
    const canView = useAuth((s) => s.canView);
    const user = useAuth((s) => s.user);
    const activeTabId = useTabs((s) => s.activeTabId);
    const tabs = useTabs((s) => s.tabs);
    const openTab = useTabs((s) => s.openTab);
    const mode = useTheme((s) => s.mode);
    const toggleTheme = useTheme((s) => s.toggle);
    const lang = useLang((s) => s.lang);
    const setLang = useLang((s) => s.setLang);
    const openPalette = usePalette((s) => s.open);
    const groups = menuGroups(manifests, canView, false, lang);
    const activeTab = tabs.find((tb) => tb.id === activeTabId) ?? null;
    const activeManifestId = activeTab?.manifestId ?? null;
    const [expanded, setExpanded] = useState<string | null>(null);
    const expandedGroups = usePrefs((s) => s.expandedGroups);
    const toggleExpandedGroup = usePrefs((s) => s.toggleExpandedGroup);
    const setExpandedGroups = usePrefs((s) => s.setExpandedGroups);

    useEffect(() => {
        setExpanded((prev) => syncExpandedWithActive(prev, activeManifestId));
    }, [activeManifestId]);

    // A tab focusing a group member expands its group (issue #71); other
    // groups keep their persisted state.
    useEffect(() => {
        const next = syncGroupsWithActive(expandedGroups, activeManifestId, manifests);
        if (next !== expandedGroups) setExpandedGroups(next);
    }, [activeManifestId, manifests, expandedGroups, setExpandedGroups]);

    const rowProps = {
        lang,
        activeTab,
        activeManifestId,
        expanded,
        setExpanded,
        unreachableIds,
        tabs,
        openTab,
        onOpen,
    };

    return (
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-bg-elevated md:flex">
            <div className="flex items-center justify-between px-4 py-4">
                <span className={TYPE_SCALE.brand}>Fusion Shell</span>
                <span className="flex gap-1">
                    <button
                        type="button"
                        onClick={openPalette}
                        className={TYPE_SCALE.iconBtn}
                        aria-label={t('打开命令面板 (⌘K)', 'Open command palette (⌘K)')}
                        title="⌘K"
                    >
                        ⌘K
                    </button>
                    <NotificationBell />
                    <button
                        type="button"
                        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                        className="rounded p-1 text-xs text-text-muted hover:bg-bg-muted"
                        aria-label="toggle language"
                    >
                        {lang === 'zh' ? 'EN' : '中'}
                    </button>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="rounded p-1 text-xs text-text-muted hover:bg-bg-muted"
                        aria-label="toggle theme"
                    >
                        {mode === 'dark' ? t('浅色', 'Light') : t('深色', 'Dark')}
                    </button>
                </span>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                <button
                    type="button"
                    onClick={() => {
                        useTabs.getState().goHome();
                        // Also leaves an open admin page (issue #51): goHome
                        // alone is a no-op when no tab was active.
                        navigateShell('/');
                    }}
                    className={`mb-3 flex w-full items-center rounded-md px-2 py-2 text-left text-sm ${activeTabId === null ? 'bg-brand/15 text-brand' : 'text-text-primary hover:bg-bg-muted'}`}
                >
                    <span aria-hidden className="mr-2">
                        ⌂
                    </span>
                    {t('首页', 'Home')}
                </button>
                {groups.map((g) => (
                    <div key={g.category} className="mb-3">
                        <div className={TYPE_SCALE.groupLabel}>{g.label}</div>
                        {g.items.map((entry) =>
                            entry.kind === 'group' ? (
                                <div key={`group:${entry.id}`} className="mb-1">
                                    <button
                                        type="button"
                                        aria-expanded={expandedGroups.has(entry.id)}
                                        aria-label={`${t('展开分组', 'Expand group')}: ${groupTitle(entry, lang)}`}
                                        onClick={() => toggleExpandedGroup(entry.id)}
                                        className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left ${TYPE_SCALE.l1} ${TYPE_SCALE.l1Idle} ${groupAllUnreachable(entry.members, unreachableIds) ? TYPE_SCALE.offline : ''}`}
                                    >
                                        <span className="truncate">{groupTitle(entry, lang)}</span>
                                        <span
                                            className={`ml-1 shrink-0 text-xs text-text-muted ${expandedGroups.has(entry.id) ? 'rotate-90' : ''}`}
                                            aria-hidden
                                        >
                                            ▸
                                        </span>
                                    </button>
                                    {expandedGroups.has(entry.id)
                                        ? entry.members.map((m) => (
                                              <div key={m.id} className="pl-3">
                                                  <ModuleMenuRow m={m} {...rowProps} />
                                              </div>
                                          ))
                                        : null}
                                </div>
                            ) : (
                                <ModuleMenuRow key={entry.m.id} m={entry.m} {...rowProps} />
                            )
                        )}
                    </div>
                ))}
                {groups.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-text-muted">
                        {t(
                            '暂无被授权的模块，请联系管理员分配',
                            'No granted modules yet; ask an admin for access'
                        )}
                    </div>
                ) : null}
            </nav>
            <div className="border-t border-border px-4 py-3 text-xs text-text-secondary">
                <div className="truncate">{user?.display_name ?? user?.user_id}</div>
                <div className="mt-1 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigateShell(pathForAdminPage('settings'))}
                        className="text-text-muted hover:text-brand"
                    >
                        {t('⚙ 设置', '⚙ Settings')}
                    </button>
                    {user?.roles.includes('admin') ? (
                        <button
                            type="button"
                            onClick={() => navigateShell(pathForAdminPage('admin-users'))}
                            className="text-text-muted hover:text-brand"
                        >
                            {t('👥 用户', '👥 Users')}
                        </button>
                    ) : null}
                    {user?.roles.includes('admin') || user?.roles.includes('auditor') ? (
                        <button
                            type="button"
                            onClick={() => navigateShell(pathForAdminPage('audit'))}
                            className="text-text-muted hover:text-brand"
                        >
                            {t('☰ 审计', '☰ Audit')}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onLogout}
                        className="text-text-muted hover:text-error"
                    >
                        {t('退出登录', 'Sign out')}
                    </button>
                </div>
            </div>
        </aside>
    );
}

/**
 * One module row (issue #71): the pre-existing two-level row — L1 opens the
 * default page and expands, chevron toggles its pages, "+" re-opens a second
 * instance — reused unchanged for flat modules and as a group member (the
 * member renders indented via its wrapper).
 */
function ModuleMenuRow({
    m,
    lang,
    activeTab,
    activeManifestId,
    expanded,
    setExpanded,
    unreachableIds,
    tabs,
    openTab,
    onOpen,
}: {
    m: ModuleManifest;
    lang: 'zh' | 'en';
    activeTab: { id: string; manifestId: string; route?: string } | null;
    activeManifestId: string | null;
    expanded: string | null;
    setExpanded: React.Dispatch<React.SetStateAction<string | null>>;
    unreachableIds: Set<string>;
    tabs: { id: string; manifestId: string }[];
    openTab: (
        m: ModuleManifest,
        opts?: { multi?: boolean; route?: string; pageTitle?: string }
    ) => string | null;
    onOpen(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
}) {
    const unreachable = unreachableIds.has(m.id);
    const active = activeManifestId === m.id;
    const alreadyOpen = tabs.some((tb) => tb.manifestId === m.id);
    const pages = m.pages ?? [];
    const open = expanded === m.id;
    return (
        <div>
            <div className="flex items-center">
                <button
                    type="button"
                    onClick={() => {
                        const intent = rowClickIntent(expanded, m.id);
                        if (intent.navigate) onOpen(m);
                        setExpanded((prev) => (intent.expand ? m.id : toggleExpanded(prev, m.id)));
                    }}
                    className={`flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-2 text-left ${TYPE_SCALE.l1} ${active ? TYPE_SCALE.l1Active : TYPE_SCALE.l1Idle}`}
                >
                    <span className={`truncate ${unreachable ? TYPE_SCALE.offline : ''}`}>
                        {moduleTitle(m, lang)}
                    </span>
                    {unreachable ? (
                        <span className="ml-2 shrink-0 text-xs text-offline">
                            {t('离线', 'Offline')}
                        </span>
                    ) : null}
                </button>
                {pages.length > 0 ? (
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-label={`${t('展开页面列表', 'Expand page list')}: ${moduleTitle(m, lang)}`}
                        onClick={() => setExpanded((prev) => toggleExpanded(prev, m.id))}
                        className={`ml-1 shrink-0 rounded p-1 ${TYPE_SCALE.affix} ${open ? 'rotate-90' : ''}`}
                    >
                        ▸
                    </button>
                ) : null}
                {alreadyOpen ? (
                    <button
                        type="button"
                        aria-label={`${t('再开一个实例', 'Open another instance')}: ${moduleTitle(m, lang)}`}
                        title={t('再开一个实例', 'Open another instance')}
                        onClick={() => {
                            const id = openTab(m, { multi: true });
                            if (!id) console.warn('[sidebar] multi open refused (limit?)', m.id);
                        }}
                        className={`ml-1 shrink-0 rounded px-1.5 ${TYPE_SCALE.affix}`}
                    >
                        +
                    </button>
                ) : null}
            </div>
            {open
                ? pages.map((page) => {
                      const pageTitle = lang === 'en' && page.title_en ? page.title_en : page.title;
                      const pageActive = isPageActive(activeTab, m.id, page.route);
                      return (
                          <button
                              key={`${m.id}:${page.route}`}
                              type="button"
                              onClick={() => onOpen(m, page.route, pageTitle)}
                              className={`flex min-w-0 items-center rounded-md px-2 py-1.5 pl-7 text-left ${TYPE_SCALE.l2} ${pageActive ? TYPE_SCALE.l2Active : TYPE_SCALE.l2Idle}`}
                          >
                              <span className="truncate">{pageTitle}</span>
                          </button>
                      );
                  })
                : null}
        </div>
    );
}
