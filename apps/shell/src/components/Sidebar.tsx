import { NotificationBell } from '@/components/NotificationBell';
import { pushToast } from '@/components/ToastHost';
import { ROUTE_EVENT, navigateShell, pathForAdminPage } from '@/lib/adminRoute';
import {
    type CatalogEntry,
    catalogRows,
    groupedCatalogRows,
    installCommand,
} from '@/lib/catalogTree';
import {
    MODULE_STATUS_DOT,
    type ModuleStatus,
    groupStatus,
    isPageActive,
    loadLastSeen,
    moduleStatus,
    offlineTooltip,
    rowClickIntent,
    syncExpandedWithActive,
    syncGroupsWithActive,
    toggleExpanded,
    unreadCountFor,
} from '@/lib/sidebarTree';
import { useAuth } from '@/stores/auth';
import { useCatalog } from '@/stores/catalog';
import { t, useLang } from '@/stores/lang';
import {
    groupAllUnreachable,
    groupTitle,
    menuGroups,
    moduleTitle,
    sectionOfId,
    useManifests,
} from '@/stores/manifests';
import { useNotifications } from '@/stores/notifications';
import { usePalette } from '@/stores/palette';
import { usePrefs } from '@/stores/prefs';
import { useTabs } from '@/stores/tabs';
import { useTasks } from '@/stores/tasks';
import { useTheme } from '@/stores/theme';
import type { ModuleManifest, ModulePage } from '@/types/manifest';
import {
    Activity,
    Bot,
    Boxes,
    Clapperboard,
    FileText,
    GraduationCap,
    type LucideIcon,
    MessageSquare,
    Package,
    Palette,
    PenTool,
    Settings,
    ShieldCheck,
    Terminal,
    TrendingUp,
    Waves,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
    onOpen(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
    onLogout(): void;
}

/**
 * Sidebar type scale (issue #53, retooled by #99/MT-2): 32px rows with a
 * 16px lucide icon, rounded-lg hover surface, active = brand left bar +
 * brand/10 fill; section headers are 11px uppercase (12px zh) muted labels.
 */
const TYPE_SCALE = {
    brand: 'font-serif text-lg font-normal text-text-primary',
    iconBtn: 'rounded p-1 text-xs text-text-muted hover:bg-bg-muted',
    sectionZh: 'px-2 pb-1 text-xs text-text-muted',
    sectionEn: 'px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted',
    l1: 'text-sm',
    l1Idle: 'text-text-primary',
    l1Active: 'text-brand',
    l2: 'text-[13px] hover:bg-bg-muted hover:text-text-primary',
    l2Idle: 'text-text-secondary',
    l2Active: 'text-brand hover:text-brand',
    affix: 'text-xs text-text-muted hover:bg-bg-muted hover:text-brand',
} as const;

/** Sections collapsible per MT-3: domain + platform; core/governance stay open. */
const COLLAPSIBLE_SECTIONS: ReadonlySet<string> = new Set(['domain', 'platform']);

/** Curated icon per module id (issue #99, MT-2 visual system). */
const MODULE_ICONS: Record<string, LucideIcon> = {
    'fusion-cowork': MessageSquare,
    'fusion-code': Terminal,
    'fusion-agent-studio': Bot,
    'fusion-artifacts': Package,
    'fusion-design': Palette,
    'fusion-security': ShieldCheck,
    'fusion-mlx': Activity,
    'fusion-admin': Settings,
    'fusion-doc': FileText,
};

/** Gateway configs carry PascalCase lucide icon names (issue #99). */
const NAMED_ICONS: Record<string, LucideIcon> = {
    GraduationCap,
    ShieldCheck,
    Boxes,
    Clapperboard,
    Waves,
    Bot,
    Palette,
    PenTool,
    MessageSquare,
    Terminal,
    TrendingUp,
    Package,
    Settings,
    FileText,
    Activity,
};

function iconFor(m: ModuleManifest): LucideIcon {
    const named = m.icon ? NAMED_ICONS[m.icon] : undefined;
    if (named) return named;
    return MODULE_ICONS[m.id] ?? Boxes;
}

/** Go home + start a fresh conversation (issue #88 N1): goHome alone is a
 *  no-op when already home; the delayed event lets Home mount before the
 *  composer takes focus and clears the shell chat. */
function startNewChat(): void {
    useTabs.getState().goHome();
    navigateShell('/');
    window.setTimeout(() => window.dispatchEvent(new Event('fusion:new-chat')), 80);
}

/**
 * Desktop sidebar menu (>= md), four fixed sections (issue #99, MT-1:
 * Core → Governance → Domain → Platform; domain default-collapsed, both
 * lower sections collapsible with persisted memory) with three-state
 * status dots + unread count bubbles per module (MT-2). Visibility is
 * registration + RBAC only (issue #100): offline modules stay listed with
 * a gray dot and open the module-unavailable page. Two-level pages per
 * issue #46, claude.ai chrome per issue #88. Bilingual per S9.
 */
export function Sidebar({ onOpen, onLogout }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const unreachableIds = useManifests((s) => s.unreachableIds);
    const canView = useAuth((s) => s.canView);
    const activeTabId = useTabs((s) => s.activeTabId);
    const tabs = useTabs((s) => s.tabs);
    const openTab = useTabs((s) => s.openTab);
    const pendingApprovals = useTasks((s) => s.items.filter((x) => x.pendingApproval).length);
    const paletteOpen = usePalette((s) => s.openState);
    const openPalette = usePalette((s) => s.open);
    const mode = useTheme((s) => s.mode);
    const toggleTheme = useTheme((s) => s.toggle);
    const lang = useLang((l) => l.lang);
    const setLang = useLang((l) => l.setLang);
    const sections = menuGroups(manifests, canView, false, lang);
    const notifItems = useNotifications((s) => s.items);
    const readIds = useNotifications((s) => s.readIds);
    const activeTab = tabs.find((tb) => tb.id === activeTabId) ?? null;
    const activeManifestId = activeTab?.manifestId ?? null;
    const [expanded, setExpanded] = useState<string | null>(null);
    // Agents overview route highlight (issue #137): tracks in-shell SPA nav.
    const [agentsActive, setAgentsActive] = useState(
        () => window.location.pathname === pathForAdminPage('agents')
    );
    useEffect(() => {
        const sync = () => setAgentsActive(window.location.pathname === pathForAdminPage('agents'));
        window.addEventListener(ROUTE_EVENT, sync);
        window.addEventListener('popstate', sync);
        return () => {
            window.removeEventListener(ROUTE_EVENT, sync);
            window.removeEventListener('popstate', sync);
        };
    }, []);
    const expandedGroups = usePrefs((s) => s.expandedGroups);
    const toggleExpandedGroup = usePrefs((s) => s.toggleExpandedGroup);
    const setExpandedGroups = usePrefs((s) => s.setExpandedGroups);
    const expandedSections = usePrefs((s) => s.expandedSections);
    const toggleExpandedSection = usePrefs((s) => s.toggleExpandedSection);
    // Issue #116: whole product line stays browsable — not-installed catalog
    // entries render dimmed inside their section, sorted after installed ones.
    const catalogEntries = useCatalog((s) => s.entries);
    const catalogLoaded = useCatalog((s) => s.loaded);
    const catalogPending = useCatalog((s) => s.gatewayPending);
    const loadCatalog = useCatalog((s) => s.load);
    const [catalogItem, setCatalogItem] = useState<CatalogEntry | null>(null);

    useEffect(() => {
        void loadCatalog();
    }, [loadCatalog]);

    const notInstalledBySection = new Map(
        catalogLoaded && !catalogPending && catalogEntries.length > 0
            ? groupedCatalogRows(
                  // Not-installed rows only: running/stopped rows are the
                  // manifest-driven entries above.
                  catalogRows(catalogEntries, manifests, unreachableIds).filter(
                      (r) => r.state === 'not_installed'
                  ),
                  sectionOfId,
                  lang
              ).map((g) => [g.section, g.notInstalled])
            : []
    );

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
        notifItems,
        readIds,
        tabs,
        openTab,
        onOpen,
    };
    const sectionLabelCls = lang === 'zh' ? TYPE_SCALE.sectionZh : TYPE_SCALE.sectionEn;

    return (
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-bg-sidebar md:flex">
            <div className="flex items-center justify-between px-4 py-4">
                <span className={TYPE_SCALE.brand}>✳ Fusion</span>
                <span className="flex gap-1">
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
                    onClick={startNewChat}
                    className={`mb-2 flex w-full items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-left text-sm font-medium fs-elev-1 hover:border-brand ${activeTabId === null ? 'text-brand' : 'text-text-primary'}`}
                >
                    <span aria-hidden className="text-base leading-none">
                        ＋
                    </span>
                    {t('新对话', 'New chat')}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        // Guard: clicking the search field while the palette
                        // is focused must not re-open/reset it (issue #88).
                        if (!paletteOpen) openPalette();
                    }}
                    className="mb-3 flex w-full items-center gap-2 rounded-lg border border-border bg-bg-muted px-3 py-2 text-left text-xs text-text-muted hover:border-brand"
                >
                    <span aria-hidden>⌕</span>
                    {t('搜索… ⌘K', 'Search… ⌘K')}
                </button>
                {canView('fusion-cowork') || canView('fusion-agent-studio') ? (
                    <button
                        type="button"
                        onClick={() => navigateShell(pathForAdminPage('agents'))}
                        aria-current={agentsActive ? 'page' : undefined}
                        className={`mb-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                            agentsActive
                                ? 'border-brand/40 bg-brand/10 text-brand'
                                : 'border-border bg-bg-elevated text-text-primary hover:border-brand'
                        }`}
                    >
                        <Bot size={16} aria-hidden />
                        {t('Agent 总览', 'Agent Overview')}
                    </button>
                ) : null}
                {pendingApprovals > 0 ? (
                    <button
                        type="button"
                        onClick={startNewChat}
                        className="mb-3 flex w-full items-center gap-2 rounded-md border border-brand/40 bg-brand/10 px-2 py-2 text-left text-sm text-brand hover:bg-brand/15"
                    >
                        <span aria-hidden>⚠</span>
                        {t('待审批', 'Pending approvals')}
                        <span className="text-xs font-normal">({pendingApprovals})</span>
                    </button>
                ) : null}
                {sections.map((sec, index) => {
                    const collapsible = COLLAPSIBLE_SECTIONS.has(sec.section);
                    const open = !collapsible || expandedSections.has(sec.section);
                    return (
                        <div key={sec.section} className={index === 0 ? 'mb-1' : 'mt-4 mb-1'}>
                            {collapsible ? (
                                <button
                                    type="button"
                                    aria-expanded={open}
                                    aria-label={`${t('展开分组', 'Expand group')}: ${sec.label}`}
                                    onClick={() => toggleExpandedSection(sec.section)}
                                    className={`${sectionLabelCls} flex w-full items-center justify-between text-left`}
                                >
                                    <span>{sec.label}</span>
                                    <span
                                        className={`ml-1 shrink-0 text-xs text-text-muted ${open ? 'rotate-90' : ''}`}
                                        aria-hidden
                                    >
                                        ▸
                                    </span>
                                </button>
                            ) : (
                                <div className={sectionLabelCls}>{sec.label}</div>
                            )}
                            {open
                                ? sec.items.map((entry) =>
                                      entry.kind === 'group' ? (
                                          <div key={`group:${entry.id}`} className="mb-1 pt-1">
                                              <button
                                                  type="button"
                                                  aria-expanded={expandedGroups.has(entry.id)}
                                                  aria-label={`${t('展开分组', 'Expand group')}: ${groupTitle(entry, lang)}`}
                                                  onClick={() => toggleExpandedGroup(entry.id)}
                                                  className={`flex h-8 w-full items-center justify-between rounded-lg px-2 text-left ${TYPE_SCALE.l1} ${TYPE_SCALE.l1Idle} ${groupAllUnreachable(entry.members, unreachableIds) ? 'text-offline' : ''}`}
                                              >
                                                  <span className="flex min-w-0 items-center gap-2">
                                                      <GroupStatusDot
                                                          members={entry.members}
                                                          unreachableIds={unreachableIds}
                                                          notifItems={notifItems}
                                                          readIds={readIds}
                                                      />
                                                      <span className="truncate">
                                                          {groupTitle(entry, lang)}
                                                      </span>
                                                  </span>
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
                                          <ModuleMenuRow
                                              key={entry.m.id}
                                              m={entry.m}
                                              {...rowProps}
                                          />
                                      )
                                  )
                                : null}
                            {open
                                ? (notInstalledBySection.get(sec.section as never) ?? []).map(
                                      (row) => (
                                          <NotInstalledRow
                                              key={`catalog:${row.entry.id}`}
                                              entry={row.entry}
                                              lang={lang}
                                              onShow={() => setCatalogItem(row.entry)}
                                          />
                                      )
                                  )
                                : null}
                        </div>
                    );
                })}
                {sections.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-text-muted">
                        {t(
                            '暂无被授权的模块，请联系管理员分配',
                            'No granted modules yet; ask an admin for access'
                        )}
                    </div>
                ) : null}
            </nav>
            {catalogItem ? (
                <CatalogItemDialog entry={catalogItem} onClose={() => setCatalogItem(null)} />
            ) : null}
            <UserRow onLogout={onLogout} />
        </aside>
    );
}

/**
 * Not-installed catalog row (issue #116): visually distinct (dashed border,
 * dimmed) but present — clicking opens the install/details panel instead of
 * a tab.
 */
function NotInstalledRow({
    entry,
    lang,
    onShow,
}: {
    entry: CatalogEntry;
    lang: 'zh' | 'en';
    onShow(): void;
}) {
    const title = lang === 'en' && entry.title_en ? entry.title_en : entry.title;
    return (
        <button
            type="button"
            onClick={onShow}
            title={t('未安装 — 查看详情与安装方式', 'Not installed — view details and install')}
            className="flex h-8 w-full items-center gap-2 rounded-lg border border-dashed border-border px-2 text-left opacity-70 hover:border-brand hover:opacity-100"
        >
            <Boxes size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
            <span className={`truncate ${TYPE_SCALE.l1} text-text-muted`}>{title}</span>
            <span className="ml-auto shrink-0 rounded bg-bg-muted px-1.5 text-[10px] text-text-muted">
                {t('未安装', 'Not installed')}
            </span>
        </button>
    );
}

/**
 * Install/details panel (issue #116): bilingual description, footprint,
 * model needs, dependencies and the `fusion install <id>` handoff command
 * with copy. One-click start for installed-stopped items needs a start API
 * upstream (supervisor HTTP surface); until then the offline tooltip (#112)
 * carries the fusion-sv hint.
 */
function CatalogItemDialog({ entry, onClose }: { entry: CatalogEntry; onClose(): void }) {
    const lang = useLang((l) => l.lang);
    const [copied, setCopied] = useState(false);
    const cmd = installCommand(entry);
    const detail = 'mt-1 text-xs text-text-secondary';
    return (
        <div
            className="fixed inset-0 z-overlay flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="fs-elev-2 w-full max-w-md rounded-card border border-border bg-bg-elevated p-4">
                <div className="flex items-center justify-between">
                    <div className="text-base text-text-primary">
                        {lang === 'en'
                            ? (entry.title_en ?? entry.title)
                            : (entry.title_cn ?? entry.title)}
                    </div>
                    <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-muted">
                        {entry.category || t('产品线', 'product')}
                    </span>
                </div>
                {entry.description || entry.description_en ? (
                    <div className={detail}>
                        {lang === 'en'
                            ? (entry.description_en ?? entry.description)
                            : (entry.description_cn ?? entry.description)}
                    </div>
                ) : null}
                <dl className="mt-3 space-y-1.5 text-xs">
                    {entry.footprint ? (
                        <div className="flex gap-2">
                            <dt className="shrink-0 text-text-muted">{t('体积', 'Footprint')}:</dt>
                            <dd className="text-text-primary">{entry.footprint}</dd>
                        </div>
                    ) : null}
                    {entry.model_requirement ? (
                        <div className="flex gap-2">
                            <dt className="shrink-0 text-text-muted">{t('模型需求', 'Models')}:</dt>
                            <dd className="text-text-primary">{entry.model_requirement}</dd>
                        </div>
                    ) : null}
                    {entry.dependencies.length > 0 ? (
                        <div className="flex gap-2">
                            <dt className="shrink-0 text-text-muted">
                                {t('依赖', 'Dependencies')}:
                            </dt>
                            <dd className="flex flex-wrap gap-1">
                                {entry.dependencies.map((d) => (
                                    <span
                                        key={d}
                                        className="rounded bg-bg-muted px-1.5 font-mono text-text-secondary"
                                    >
                                        {d}
                                    </span>
                                ))}
                            </dd>
                        </div>
                    ) : null}
                </dl>
                <div className="mt-3">
                    <div className="text-xs text-text-muted">
                        {t('安装命令', 'Install command')}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text-primary">
                            {cmd}
                        </code>
                        <button
                            type="button"
                            onClick={() => {
                                void navigator.clipboard
                                    .writeText(cmd)
                                    .then(() => setCopied(true))
                                    .catch((err) => {
                                        console.warn('[sidebar] copy install cmd failed', err);
                                        pushToast('error', t('复制失败', 'Copy failed'));
                                    });
                            }}
                            className="fs-btn fs-btn-secondary shrink-0 text-xs"
                        >
                            {copied ? t('已复制', 'Copied') : t('复制', 'Copy')}
                        </button>
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <button type="button" onClick={onClose} className="fs-btn fs-btn-primary">
                        {t('关闭', 'Close')}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Footer user row (issue #88): circular initial avatar + display name,
 *  opening the settings/users/audit/logout menu. */
function UserRow({ onLogout }: { onLogout(): void }) {
    const user = useAuth((s) => s.user);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const name = user?.display_name ?? user?.user_id ?? '';
    const initial = (name[0] ?? '?').toUpperCase();
    const isAdmin = !!user?.roles.includes('admin');
    const isAuditor = isAdmin || !!user?.roles.includes('auditor');

    const item = 'block w-full px-2 py-1.5 text-left text-xs text-text-secondary hover:text-brand';
    return (
        <div className="relative border-t border-border px-2 py-2" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="menu"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg-muted"
            >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                    {initial}
                </span>
                <span className="truncate text-sm text-text-primary">{name}</span>
            </button>
            {open ? (
                <div
                    role="menu"
                    className="absolute bottom-full left-2 right-2 mb-1 rounded-lg border border-border bg-bg-elevated p-1.5 shadow-overlay"
                >
                    <button
                        type="button"
                        onClick={() => {
                            navigateShell(pathForAdminPage('settings'));
                            setOpen(false);
                        }}
                        className={item}
                    >
                        {t('⚙ 设置', '⚙ Settings')}
                    </button>
                    {isAdmin ? (
                        <button
                            type="button"
                            onClick={() => {
                                navigateShell(pathForAdminPage('admin-users'));
                                setOpen(false);
                            }}
                            className={item}
                        >
                            {t('👥 用户', '👥 Users')}
                        </button>
                    ) : null}
                    {isAuditor ? (
                        <button
                            type="button"
                            onClick={() => {
                                navigateShell(pathForAdminPage('audit'));
                                setOpen(false);
                            }}
                            className={item}
                        >
                            {t('☰ 审计', '☰ Audit')}
                        </button>
                    ) : null}
                    <button type="button" onClick={onLogout} className={`${item} hover:text-error`}>
                        {t('退出登录', 'Sign out')}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

/** Three-state status dot (issue #99, MT-2): green healthy, amber running
 *  with unread events, gray offline — tooltip names the state. */
function StatusDot({
    m,
    unreachableIds,
    notifItems,
    readIds,
}: {
    m: ModuleManifest;
    unreachableIds: Set<string>;
    notifItems: { id: string; moduleId: string; kind: string }[];
    readIds: Set<string>;
}) {
    const status: ModuleStatus = moduleStatus(m.id, unreachableIds, notifItems, readIds);
    const dot = MODULE_STATUS_DOT[status];
    // Issue #112: offline dots get a diagnose hint + last-online time so a
    // persistent gray dot is actionable instead of a dead end.
    const label =
        status === 'offline'
            ? t(
                  offlineTooltip(loadLastSeen()[m.id], Date.now()).zh,
                  offlineTooltip(loadLastSeen()[m.id], Date.now()).en
              )
            : t(dot.zh, dot.en);
    return (
        <span
            title={label}
            aria-label={label}
            className={`h-2 w-2 shrink-0 rounded-full ${dot.cls}`}
        />
    );
}

/** Aggregate dot for a group row (issue #104): healthy > events > offline. */
function GroupStatusDot({
    members,
    unreachableIds,
    notifItems,
    readIds,
}: {
    members: ModuleManifest[];
    unreachableIds: Set<string>;
    notifItems: { id: string; moduleId: string; kind: string }[];
    readIds: Set<string>;
}) {
    const status = groupStatus(members, unreachableIds, notifItems, readIds);
    const dot = MODULE_STATUS_DOT[status];
    const label = t(dot.zh, dot.en);
    return (
        <span
            title={label}
            aria-label={label}
            className={`h-2 w-2 shrink-0 rounded-full ${dot.cls}`}
        />
    );
}

/** Issue #153: partition a module's pages into dev and prod layers. Pages
 *  without a layer tag count as dev — when the serving chain strips `layer`
 *  the module renders one flat list (honest degradation, upstream gw#660). */
export function splitPageLayers(pages: ModulePage[]): {
    dev: ModulePage[];
    prod: ModulePage[];
} {
    return {
        dev: pages.filter((p) => p.layer !== 'prod'),
        prod: pages.filter((p) => p.layer === 'prod'),
    };
}

/** L2 page row inside a module menu: deep-links `${entry}#${route}` (#24). */
function PageRow({
    m,
    page,
    lang,
    activeTab,
    onOpen,
}: {
    m: ModuleManifest;
    page: { route: string; title: string; title_en?: string };
    lang: 'zh' | 'en';
    activeTab: { id: string; manifestId: string; route?: string } | null;
    onOpen(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
}) {
    const pageTitle = lang === 'en' && page.title_en ? page.title_en : page.title;
    const pageActive = isPageActive(activeTab, m.id, page.route);
    return (
        <button
            type="button"
            onClick={() => onOpen(m, page.route, pageTitle)}
            className={`flex h-8 min-w-0 items-center rounded-lg pl-8 pr-2 text-left ${TYPE_SCALE.l2} ${pageActive ? TYPE_SCALE.l2Active : TYPE_SCALE.l2Idle}`}
        >
            <span className="truncate">{pageTitle}</span>
        </button>
    );
}

/**
 * One module row (issue #71, retooled by #99/MT-2): 32px row with a 16px
 * lucide icon, three-state status dot and unread count bubble; active =
 * brand left bar + brand/10 fill. L1 opens the default page and expands,
 * chevron toggles its pages, "+" re-opens a second instance (PRD §6).
 * Unreachable modules stay clickable — the tab shows the unavailable page
 * (issue #100) — and keep their dot gray.
 */
function ModuleMenuRow({
    m,
    lang,
    activeTab,
    activeManifestId,
    expanded,
    setExpanded,
    unreachableIds,
    notifItems,
    readIds,
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
    notifItems: { id: string; moduleId: string; kind: string }[];
    readIds: Set<string>;
    tabs: { id: string; manifestId: string }[];
    openTab: (
        m: ModuleManifest,
        opts?: { multi?: boolean; route?: string; pageTitle?: string }
    ) => string | null;
    onOpen(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
}) {
    const active = activeManifestId === m.id;
    const alreadyOpen = tabs.some((tb) => tb.manifestId === m.id);
    const pages = m.pages ?? [];
    const { dev: devPages, prod: prodPages } = splitPageLayers(pages);
    const open = expanded === m.id;
    const unread = unreadCountFor(notifItems, readIds, m.id);
    const Icon = iconFor(m);
    return (
        <div>
            <div
                className={`flex h-8 items-center rounded-lg border-l-2 pr-0.5 ${active ? 'border-l-brand bg-brand/10' : 'border-l-transparent hover:bg-bg-muted'}`}
            >
                <button
                    type="button"
                    onClick={() => {
                        const intent = rowClickIntent(expanded, m.id);
                        if (intent.navigate) onOpen(m);
                        setExpanded((prev) => (intent.expand ? m.id : toggleExpanded(prev, m.id)));
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-2 text-left ${TYPE_SCALE.l1} ${active ? TYPE_SCALE.l1Active : TYPE_SCALE.l1Idle}`}
                >
                    <Icon
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden
                        className={`shrink-0 ${active ? 'text-brand' : 'text-text-muted'}`}
                    />
                    <span className="truncate">{moduleTitle(m, lang)}</span>
                    <span className="min-w-0 flex-1" />
                    {unread > 0 ? (
                        <span
                            title={t('未读通知', 'Unread notifications')}
                            className="min-w-4 shrink-0 rounded-full bg-brand px-1 text-center text-[10px] font-medium leading-4 text-white"
                        >
                            {unread > 99 ? '99+' : unread}
                        </span>
                    ) : null}
                    <StatusDot
                        m={m}
                        unreachableIds={unreachableIds}
                        notifItems={notifItems}
                        readIds={readIds}
                    />
                </button>
                {pages.length > 0 ? (
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-label={`${t('展开页面列表', 'Expand page list')}: ${moduleTitle(m, lang)}`}
                        onClick={() => setExpanded((prev) => toggleExpanded(prev, m.id))}
                        className={`ml-0.5 shrink-0 rounded p-1 ${TYPE_SCALE.affix} ${open ? 'rotate-90' : ''}`}
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
                        className={`ml-0.5 shrink-0 rounded px-1.5 ${TYPE_SCALE.affix}`}
                    >
                        +
                    </button>
                ) : null}
            </div>
            {open ? (
                <>
                    {devPages.map((page) => (
                        <PageRow
                            key={`${m.id}:${page.route}`}
                            m={m}
                            page={page}
                            lang={lang}
                            activeTab={activeTab}
                            onOpen={onOpen}
                        />
                    ))}
                    {prodPages.length > 0 ? (
                        <>
                            <div
                                className="flex h-6 items-center pl-8 text-[10px] font-medium uppercase tracking-wider text-text-muted"
                                aria-hidden
                            >
                                {t('生产层', 'Prod layer')}
                            </div>
                            {prodPages.map((page) => (
                                <PageRow
                                    key={`${m.id}:${page.route}`}
                                    m={m}
                                    page={page}
                                    lang={lang}
                                    activeTab={activeTab}
                                    onOpen={onOpen}
                                />
                            ))}
                        </>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
