/**
 * Marketplace page data model (issue #174, phase 1): static local catalog per
 * the owner-approved prototype (architecture/plugins-marketplace-prototype-1120.html).
 * Install/installed/update are UI state only — real install wiring waits for
 * the plugins-ecosystem registry API (tracked separately).
 */

export interface MarketplaceCategory {
    id: string;
    title: string;
    titleEn: string;
}

export interface MarketplacePlugin {
    id: string;
    title: string;
    titleEn: string;
    /** Source module id shown under the title (e.g. fusion-rag). */
    module: string;
    version: string;
    /** Present when a newer version exists (installed + update available). */
    latestVersion?: string;
    description: string;
    descriptionEn: string;
    category: string;
    tags: string[];
    installs: number;
    rating: number;
    badge?: 'official' | 'beta';
    /** Detail drawer rows; permissions rendered in warning color (prototype). */
    permissions: string;
    size: string;
    source: string;
    iconChar: string;
    /** Soft tint classes for the icon tile (owner-approved prototype palette). */
    iconClass: string;
    installed?: boolean;
}

/** Category ids are stable keys; labels are bilingual. */
export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
    { id: 'all', title: '全部', titleEn: 'All' },
    { id: 'office', title: '办公效率', titleEn: 'Office' },
    { id: 'data', title: '数据处理', titleEn: 'Data' },
    { id: 'dev-tools', title: '开发工具', titleEn: 'Developer Tools' },
    { id: 'ai', title: 'AI 能力', titleEn: 'AI Capabilities' },
    { id: 'ecommerce', title: '电商运营', titleEn: 'E-commerce' },
    { id: 'domain', title: '领域应用', titleEn: 'Domain Apps' },
];

/** Phase-1 static catalog, mirroring the approved prototype's five cards. */
export const marketplacePlugins: MarketplacePlugin[] = [
    {
        id: 'fusion-doc-excel-report',
        title: 'Excel 报表助手',
        titleEn: 'Excel Report Assistant',
        module: 'fusion-doc',
        version: '1.4.2',
        description: '上传 Excel 自动生成财务报表，支持模板渲染与多 sheet 汇总。',
        descriptionEn:
            'Upload spreadsheets to generate financial reports with template rendering and multi-sheet rollup.',
        category: 'office',
        tags: ['办公效率', 'Cowork 节点'],
        installs: 1200,
        rating: 4.8,
        permissions: '文件读取',
        size: '6.4 MB',
        source: 'fusion-doc 官方发布',
        iconChar: 'X',
        iconClass: 'bg-success/10 text-success',
    },
    {
        id: 'fusion-rag-ragkb',
        title: 'RAG 知识检索',
        titleEn: 'RAG Knowledge Retrieval',
        module: 'fusion-rag',
        version: '2.1.0',
        description: '离线向量知识库接入，为任意模块提供文档问答能力。',
        descriptionEn: 'Offline vector knowledge base; adds document Q&A to any host module.',
        category: 'ai',
        tags: ['AI 能力', '官方'],
        installs: 3400,
        rating: 4.9,
        badge: 'official',
        permissions: '文件读取 · 网络(本机)',
        size: '18.2 MB',
        source: 'fusion-rag 官方发布',
        iconChar: 'R',
        iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
        installed: true,
    },
    {
        id: 'fusion-ecommerce-radar',
        title: 'Douyin 选品雷达',
        titleEn: 'Douyin Product Radar',
        module: 'fusion-ecommerce',
        version: '0.9.1',
        description: '抖音商品趋势分析，热销品类监控与选品建议推送。',
        descriptionEn: 'Douyin product trend analysis with hot-category monitoring and picks.',
        category: 'ecommerce',
        tags: ['电商运营', 'Beta'],
        installs: 860,
        rating: 4.5,
        badge: 'beta',
        permissions: '网络(本机) · 文件读取',
        size: '9.8 MB',
        source: 'fusion-ecommerce 官方发布',
        iconChar: 'D',
        iconClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    },
    {
        id: 'fusion-gupiao-panel',
        title: '股票行情面板',
        titleEn: 'A-Share Quote Panel',
        module: 'fusion-gupiao',
        version: '1.1.0',
        description: 'A 股实时行情嵌入面板，自选股提醒与指标快照。',
        descriptionEn: 'Embedded A-share quote panel with watchlist alerts and snapshots.',
        category: 'domain',
        tags: ['领域应用'],
        installs: 2100,
        rating: 4.6,
        permissions: '网络(本机)',
        size: '4.1 MB',
        source: 'fusion-gupiao 官方发布',
        iconChar: 'S',
        iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    },
    {
        id: 'fusion-code-review-skill',
        title: '代码审查 Skill',
        titleEn: 'Code Review Skill',
        module: 'fusion-code',
        version: '0.3.0',
        latestVersion: '0.4.0',
        description: '为 Cowork 管线提供 diff 审查节点，输出结构化评审意见。',
        descriptionEn: 'Diff review node for Cowork pipelines with structured findings.',
        category: 'dev-tools',
        tags: ['开发工具', 'Skill'],
        installs: 1700,
        rating: 4.7,
        permissions: '文件读取',
        size: '2.3 MB',
        source: 'fusion-code 官方发布',
        iconChar: 'C',
        iconClass: 'bg-warning/10 text-warning',
        installed: true,
    },
];

/** Counts per category id including the `all` total (issue #174 sidebar). */
export function categoryCounts(plugins: MarketplacePlugin[]): Map<string, number> {
    const counts = new Map<string, number>([['all', plugins.length]]);
    for (const p of plugins) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return counts;
}

/**
 * Search + category filter (issue #174 acceptance): whitespace-separated
 * query terms must all match the zh/en title, description, module id or tags
 * (case-insensitive AND semantics); `all` skips the category predicate.
 */
export function filterPlugins(
    plugins: MarketplacePlugin[],
    query: string,
    categoryId: string
): MarketplacePlugin[] {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return plugins.filter((p) => {
        if (categoryId !== 'all' && p.category !== categoryId) return false;
        if (terms.length === 0) return true;
        const haystack = [p.title, p.titleEn, p.description, p.descriptionEn, p.module, ...p.tags]
            .join(' ')
            .toLowerCase();
        return terms.every((term) => haystack.includes(term));
    });
}

/** Installed + pending-update sections (issue #174 sidebar tail). */
export function installStateSections(plugins: MarketplacePlugin[]): {
    installed: MarketplacePlugin[];
    updates: MarketplacePlugin[];
} {
    const installed = plugins.filter((p) => p.installed);
    const updates = installed.filter(
        (p) => p.latestVersion !== undefined && p.latestVersion !== p.version
    );
    return { installed, updates };
}

/** Pure install toggle (phase-1 UI state): flip one plugin, no input mutation. */
export function toggleInstalled(plugins: MarketplacePlugin[], id: string): MarketplacePlugin[] {
    return plugins.map((p) => (p.id === id ? { ...p, installed: !p.installed } : p));
}
