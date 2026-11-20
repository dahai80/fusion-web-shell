import {
    MARKETPLACE_CATEGORIES,
    type MarketplacePlugin,
    categoryCounts,
    filterPlugins,
    installStateSections,
    marketplacePlugins,
    toggleInstalled,
} from '@/lib/marketplaceData';
import { t, useLang } from '@/stores/lang';
import { Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';

/**
 * Marketplace page (issue #174, phase 1): owner-approved prototype
 * (architecture/plugins-marketplace-prototype-1120.html) rendered with shell
 * tokens — hero + search, category sidebar with counts + installed/updates,
 * 3-col plugin card grid, publish-your-plugin dashed card, right detail
 * drawer with the permissions row. Static local data; install states are UI
 * only until the plugins-ecosystem registry API lands (tracked upstream).
 */
export function MarketplacePage() {
    useLang((l) => l.lang);
    const [plugins, setPlugins] = useState(marketplacePlugins);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [installedView, setInstalledView] = useState<'none' | 'installed' | 'updates'>('none');
    const [detail, setDetail] = useState<MarketplacePlugin | null>(null);

    const lang = useLang((l) => l.lang);
    const counts = useMemo(() => categoryCounts(plugins), [plugins]);
    const sections = useMemo(() => installStateSections(plugins), [plugins]);
    const visible = useMemo(() => {
        let list = filterPlugins(plugins, query, category);
        if (installedView === 'installed') list = list.filter((p) => p.installed);
        if (installedView === 'updates') list = list.filter((p) => p.latestVersion);
        return list;
    }, [plugins, query, category, installedView]);

    const pickCategory = (id: string) => {
        setCategory(id);
        setInstalledView('none');
    };
    const pickSection = (view: 'installed' | 'updates') => {
        setInstalledView((prev) => (prev === view ? 'none' : view));
    };
    const onInstall = (p: MarketplacePlugin) => {
        // Phase 1: UI state only; registry wiring tracked upstream.
        console.log('[marketplace] install toggle (phase 1, UI only):', p.id);
        setPlugins((prev) => toggleInstalled(prev, p.id));
    };

    const title = lang === 'en' ? 'Marketplace' : '插件市场';

    return (
        <div className="mx-auto max-w-7xl px-4 py-6">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                        {title}
                    </h1>
                    <p className="mt-1 text-sm text-text-muted">
                        {t(
                            '发现、安装和管理 Fusion 生态插件 · Marketplace for Fusion plugins, skills and module extensions',
                            'Discover, install and manage Fusion ecosystem plugins, skills and module extensions'
                        )}
                    </p>
                </div>
                <div className="flex w-full gap-2 md:ml-auto md:w-96">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t(
                                '搜索插件、能力、关键词…',
                                'Search plugins, skills, keywords…'
                            )}
                            aria-label={t('搜索插件', 'Search plugins')}
                            className="w-full rounded-xl border border-border bg-bg-elevated py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/40"
                        />
                        <Search
                            size={15}
                            aria-hidden
                            className="absolute left-3 top-2.5 text-text-muted"
                        />
                    </div>
                    <button type="button" className="fs-btn fs-btn-primary shrink-0">
                        <Upload size={14} aria-hidden className="mr-1 inline" />
                        {t('上传插件', 'Upload plugin')}
                    </button>
                </div>
            </div>

            <div className="flex gap-6">
                <aside className="hidden w-52 shrink-0 md:block">
                    <div className="sticky top-4 space-y-1 text-sm">
                        <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                            {t('分类 Categories', 'Categories')}
                        </div>
                        {MARKETPLACE_CATEGORIES.map((row) => {
                            const active = installedView === 'none' && category === row.id;
                            return (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => pickCategory(row.id)}
                                    aria-current={active ? 'true' : undefined}
                                    className={`block w-full rounded-xl px-3 py-2 text-left ${
                                        active
                                            ? 'bg-bg-muted font-medium text-text-primary'
                                            : 'text-text-secondary hover:bg-bg-muted hover:text-text-primary'
                                    }`}
                                >
                                    {lang === 'en' ? row.titleEn : row.title}
                                    <span className="float-right text-xs text-text-muted">
                                        {counts.get(row.id) ?? 0}
                                    </span>
                                </button>
                            );
                        })}
                        <div className="px-3 pb-2 pt-6 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                            {t('我已安装 Installed', 'Installed')}
                        </div>
                        <button
                            type="button"
                            onClick={() => pickSection('installed')}
                            aria-pressed={installedView === 'installed'}
                            className={`block w-full rounded-xl px-3 py-2 text-left ${
                                installedView === 'installed'
                                    ? 'bg-bg-muted font-medium text-text-primary'
                                    : 'text-text-secondary hover:bg-bg-muted hover:text-text-primary'
                            }`}
                        >
                            {t('已安装', 'Installed')} ({sections.installed.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => pickSection('updates')}
                            aria-pressed={installedView === 'updates'}
                            className={`block w-full rounded-xl px-3 py-2 text-left ${
                                installedView === 'updates'
                                    ? 'bg-bg-muted font-medium text-text-primary'
                                    : 'text-text-secondary hover:bg-bg-muted hover:text-text-primary'
                            }`}
                        >
                            {t('待更新', 'Updates')} ({sections.updates.length})
                        </button>
                    </div>
                </aside>

                <section className="min-w-0 flex-1">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {visible.map((p) => (
                            <PluginCard
                                key={p.id}
                                plugin={p}
                                lang={lang}
                                onOpen={() => setDetail(p)}
                                onInstall={() => onInstall(p)}
                            />
                        ))}
                        {visible.length === 0 ? (
                            <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
                                {t('没有匹配的插件', 'No matching plugins')}
                            </div>
                        ) : null}
                        <button
                            type="button"
                            className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-4 text-center hover:border-brand"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-muted text-lg text-text-muted">
                                +
                            </span>
                            <span className="mt-3 text-sm font-medium text-text-primary">
                                {t('发布你的插件', 'Publish your plugin')}
                            </span>
                            <span className="mt-1 text-xs text-text-muted">
                                {t(
                                    '打包 manifest 后上传，经审核上架',
                                    'Package a manifest, upload, pass review'
                                )}
                            </span>
                            <span className="fs-btn fs-btn-secondary mt-3 text-xs">
                                {t('查看发布指南', 'Publishing guide')}
                            </span>
                        </button>
                    </div>
                </section>
            </div>

            {detail ? (
                <DetailDrawer
                    plugin={detail}
                    lang={lang}
                    onClose={() => setDetail(null)}
                    onInstall={() => {
                        onInstall(detail);
                        setDetail({ ...detail, installed: !detail.installed });
                    }}
                />
            ) : null}
        </div>
    );
}

function badgeClass(badge: NonNullable<MarketplacePlugin['badge']>): string {
    if (badge === 'official') return 'bg-success/10 text-success';
    return 'bg-warning/10 text-warning';
}

function PluginCard({
    plugin: p,
    lang,
    onOpen,
    onInstall,
}: {
    plugin: MarketplacePlugin;
    lang: 'zh' | 'en';
    onOpen(): void;
    onInstall(): void;
}) {
    const updateAvailable = p.installed && p.latestVersion && p.latestVersion !== p.version;
    return (
        <div className="group rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm transition-all hover:border-brand/40 hover:shadow-md">
            <button type="button" onClick={onOpen} className="block w-full text-left">
                <div className="flex items-start gap-3">
                    <div
                        aria-hidden
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${p.iconClass}`}
                    >
                        {p.iconChar}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-text-primary">
                            {lang === 'en' ? p.titleEn : p.title}
                        </div>
                        <div className="mt-0.5 text-xs text-text-muted">
                            {p.module} · v{p.version}
                        </div>
                    </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-text-secondary">
                    {lang === 'en' ? p.descriptionEn : p.description}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                    {p.tags.map((tag) => (
                        <span
                            key={tag}
                            className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-secondary"
                        >
                            {tag}
                        </span>
                    ))}
                    {p.badge ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass(p.badge)}`}>
                            {p.badge === 'official' ? t('官方', 'Official') : 'Beta'}
                        </span>
                    ) : null}
                </div>
            </button>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-text-muted">
                    ⬇ {formatInstalls(p.installs)} · ★ {p.rating}
                </span>
                {updateAvailable ? (
                    <button
                        type="button"
                        onClick={onInstall}
                        className="fs-btn fs-btn-secondary text-xs"
                    >
                        {t('更新', 'Update')} ·{p.latestVersion}
                    </button>
                ) : p.installed ? (
                    <button
                        type="button"
                        onClick={onOpen}
                        className="fs-btn fs-btn-secondary text-xs"
                        disabled
                    >
                        {t('已安装 ✓', 'Installed ✓')}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onInstall}
                        className="fs-btn fs-btn-primary text-xs"
                    >
                        {t('安装', 'Install')}
                    </button>
                )}
            </div>
        </div>
    );
}

function formatInstalls(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * Detail drawer (issue #174 acceptance): version/size/permissions/source rows
 * — the permissions row renders in warning color per the approved prototype.
 */
function DetailDrawer({
    plugin: p,
    lang,
    onClose,
    onInstall,
}: {
    plugin: MarketplacePlugin;
    lang: 'zh' | 'en';
    onClose(): void;
    onInstall(): void;
}) {
    const rows: [string, string, string?][] = [
        [t('版本', 'Version'), p.latestVersion ?? p.version],
        [t('大小', 'Size'), p.size],
        [t('权限', 'Permissions'), p.permissions, 'text-warning'],
        [t('来源', 'Source'), p.source],
    ];
    return (
        <div className="fixed inset-0 z-overlay" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onMouseDown={onClose} />
            <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-bg-elevated p-6">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div
                            aria-hidden
                            className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold ${p.iconClass}`}
                        >
                            {p.iconChar}
                        </div>
                        <div>
                            <div className="font-semibold text-text-primary">
                                {lang === 'en' ? p.titleEn : p.title}
                            </div>
                            <div className="mt-0.5 text-xs text-text-muted">
                                {p.module} · v{p.version}
                                {p.badge
                                    ? ` · ${p.badge === 'official' ? t('官方', 'Official') : 'Beta'}`
                                    : ''}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('关闭详情', 'Close details')}
                        className="rounded-lg p-2 text-text-muted hover:bg-bg-muted"
                    >
                        ✕
                    </button>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                    {lang === 'en' ? p.descriptionEn : p.description}
                </p>
                <dl className="mt-5 space-y-2 text-sm">
                    {rows.map(([label, value, valueCls]) => (
                        <div
                            key={label}
                            className="flex justify-between border-b border-border py-2"
                        >
                            <dt className="text-text-muted">{label}</dt>
                            <dd className={valueCls ?? 'text-text-primary'}>{value}</dd>
                        </div>
                    ))}
                </dl>
                <div className="mt-6 flex gap-2">
                    {p.installed ? (
                        <button type="button" className="fs-btn fs-btn-primary flex-1" disabled>
                            {t('已安装 ✓', 'Installed ✓')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onInstall}
                            className="fs-btn fs-btn-primary flex-1"
                        >
                            {t('安装', 'Install')}
                        </button>
                    )}
                    <button type="button" className="fs-btn fs-btn-secondary">
                        {t('查看源码', 'View source')}
                    </button>
                </div>
            </aside>
        </div>
    );
}
