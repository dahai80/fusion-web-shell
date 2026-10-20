import { sharedClient } from '@/api/client';
import type { Lang } from '@/stores/lang';
import { moduleTitle } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import type { ModuleManifest } from '@/types/manifest';
import { create } from 'zustand';

/** ⌘K command palette model (issue #24, G4/C1): three aggregated sources —
 * navigation (modules + sub-page deep links), quick actions, and
 * cross-module search providers registered via the manifest ext. */

export type CommandGroup = 'nav' | 'action' | 'search';

export interface PaletteCommand {
    id: string;
    group: CommandGroup;
    label: string;
    hint?: string;
    keywords?: string;
    run(): void;
}

export function buildNavCommands(
    manifests: ModuleManifest[],
    canView: (id: string) => boolean,
    lang: Lang = 'zh'
): PaletteCommand[] {
    const cmds: PaletteCommand[] = [];
    for (const m of manifests) {
        if (m.unreachable || !canView(m.id)) continue;
        const title = moduleTitle(m, lang);
        cmds.push({
            id: `nav:${m.id}`,
            group: 'nav',
            label: title,
            keywords: `${m.id} ${m.title} ${m.title_en ?? ''}`,
            run() {
                useTabs.getState().openTab(m);
            },
        });
        for (const page of m.pages ?? []) {
            const pageTitle = lang === 'en' && page.title_en ? page.title_en : page.title;
            cmds.push({
                id: `nav:${m.id}:${page.route}`,
                group: 'nav',
                label: `${title} · ${pageTitle}`,
                keywords: `${m.id} ${page.route} ${page.title} ${page.title_en ?? ''}`,
                run() {
                    useTabs.getState().openTab(m, { route: page.route, pageTitle });
                },
            });
        }
    }
    return cmds;
}

/** Shell-declared quick actions bound to module sub-page routes (R3).
 * Modules adopt exact routes via their own issues (#138/#406/#1278). */
export interface QuickActionDef {
    id: string;
    moduleId: string;
    route: string;
    label: string;
    label_en: string;
    keywords: string;
    run(manifests: ModuleManifest[]): void;
}

export const QUICK_ACTIONS: QuickActionDef[] = [
    {
        id: 'new-workflow',
        moduleId: 'fusion-cowork',
        route: '/workflows?new=1',
        label: '新建工作流',
        label_en: 'New workflow',
        keywords: 'new create workflow cowork 新建 创建',
        run(manifests) {
            const m = manifests.find((x) => x.id === this.moduleId);
            if (m) useTabs.getState().openTab(m, { route: this.route, pageTitle: this.label });
        },
    },
    {
        id: 'run-graph',
        moduleId: 'fusion-agent-studio',
        route: '/canvas?run=1',
        label: '运行图',
        label_en: 'Run graph',
        keywords: 'run graph agent-studio canvas 运行 执行',
        run(manifests) {
            const m = manifests.find((x) => x.id === this.moduleId);
            if (m) useTabs.getState().openTab(m, { route: this.route, pageTitle: this.label });
        },
    },
    {
        id: 'load-model',
        moduleId: 'fusion-mlx',
        route: '/models?load=1',
        label: '加载模型',
        label_en: 'Load model',
        keywords: 'load model mlx engine 加载 模型',
        run(manifests) {
            const m = manifests.find((x) => x.id === this.moduleId);
            if (m) useTabs.getState().openTab(m, { route: this.route, pageTitle: this.label });
        },
    },
];

export function buildQuickActions(
    manifests: ModuleManifest[],
    canView: (id: string) => boolean,
    lang: Lang = 'zh'
): PaletteCommand[] {
    const out: PaletteCommand[] = [];
    for (const a of QUICK_ACTIONS) {
        const m = manifests.find((x) => x.id === a.moduleId);
        if (!m || m.unreachable || !canView(m.id)) continue;
        out.push({
            id: `action:${a.id}`,
            group: 'action',
            label: lang === 'en' ? a.label_en : a.label,
            hint: moduleTitle(m, lang),
            keywords: `${a.keywords} ${a.label_en} ${a.label}`,
            run: () => a.run(manifests),
        });
    }
    return out;
}

export function filterCommands(cmds: PaletteCommand[], query: string): PaletteCommand[] {
    const q = query.trim().toLowerCase();
    if (!q) return cmds;
    return cmds.filter(
        (c) => c.label.toLowerCase().includes(q) || (c.keywords ?? '').toLowerCase().includes(q)
    );
}

export type SearchFetcher = (
    path: string
) => Promise<{ items?: Array<{ title?: unknown; route?: unknown }> }>;

const SEARCH_TIMEOUT_MS = 5000;

function defaultFetcher(): SearchFetcher {
    return async (path) => {
        try {
            return await sharedClient().get(path);
        } catch (err) {
            console.warn('[palette] provider fetch failed:', path, err);
            return {};
        }
    };
}

function deepLinkCommand(
    m: ModuleManifest,
    providerLabel: string,
    itemTitle: string,
    route: string | null
): PaletteCommand | null {
    const base: PaletteCommand = {
        id: `search:${m.id}:${itemTitle}:${route ?? ''}`,
        group: 'search',
        label: itemTitle,
        hint: `${providerLabel} · ${moduleTitle(m)}`,
        run() {
            if (route) {
                useTabs.getState().openTab(m, { route, pageTitle: itemTitle });
            } else {
                useTabs.getState().openTab(m);
            }
        },
    };
    return base;
}

/** Query every granted, reachable module's search provider in parallel.
 * Per-provider failure is isolated (warn + skip, R4). */
export async function runSearch(
    manifests: ModuleManifest[],
    canView: (id: string) => boolean,
    query: string,
    fetcher: SearchFetcher = defaultFetcher()
): Promise<PaletteCommand[]> {
    const q = query.trim();
    if (!q) return [];
    const targets = manifests.flatMap((m) =>
        m.unreachable || !canView(m.id) ? [] : (m.searchProviders ?? []).map((p) => ({ m, p }))
    );
    const settled = await Promise.allSettled(
        targets.map(async ({ m, p }) => {
            const path = `${p.endpoint}?q=${encodeURIComponent(q)}`;
            const data = await withTimeout(fetcher(path));
            const items = Array.isArray(data?.items) ? data.items : [];
            const label = moduleTitle(m);
            return items
                .slice(0, 8)
                .map((item) => {
                    const title = typeof item.title === 'string' ? item.title.trim() : '';
                    const route = typeof item.route === 'string' ? item.route : null;
                    if (!title) return null;
                    return deepLinkCommand(m, p.label, title, route);
                })
                .filter((c): c is PaletteCommand => c !== null)
                .map((c) => ({
                    ...c,
                    hint: `${c.hint?.split(' · ')[0] ?? ''} · ${label}`.replace(/^ · /, ''),
                }));
        })
    );
    const out: PaletteCommand[] = [];
    for (const r of settled) {
        if (r.status === 'fulfilled') out.push(...r.value);
        else console.warn('[palette] provider rejected:', r.reason);
    }
    return out;
}

function withTimeout<T>(p: Promise<T>, ms = SEARCH_TIMEOUT_MS): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('search timeout')), ms);
        p.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            (e) => {
                clearTimeout(timer);
                reject(e);
            }
        );
    });
}

interface PaletteState {
    openState: boolean;
    query: string;
    activeIndex: number;
    open(): void;
    close(): void;
    setQuery(q: string): void;
    setActive(i: number): void;
}

export const usePalette = create<PaletteState>((set) => ({
    openState: false,
    query: '',
    activeIndex: 0,
    open() {
        set({ openState: true, query: '', activeIndex: 0 });
        console.log('[palette] open');
    },
    close() {
        set({ openState: false, query: '', activeIndex: 0 });
    },
    setQuery(q) {
        set({ query: q, activeIndex: 0 });
    },
    setActive(i) {
        set({ activeIndex: i });
    },
}));
