import type { ModuleManifest } from '@/types/manifest';
import { create } from 'zustand';

export const MAX_TABS = 12;

export type TabStatus = 'active' | 'hidden' | 'crashed';

export interface ShellTab {
    id: string;
    manifestId: string;
    title: string;
    status: TabStatus;
    seq: number;
    src: string | null;
    hasActiveTask: boolean;
    crashedAt?: number;
    /** Deep-link state (issue #24, C8): survives refresh restore. */
    route?: string;
    pageTitle?: string;
    /** Refresh-restored tab whose streaming task was interrupted (PRD §6.1). */
    interrupted?: boolean;
    /** Last gateway error envelope hint (A5 tab status strip). */
    transientError?: string | null;
}

/** Deep-link options (issue #24, C8): route becomes `${src}#${route}`. */
export interface OpenTabOptions {
    multi?: boolean;
    route?: string;
    pageTitle?: string;
}

export interface TabsState {
    tabs: ShellTab[];
    activeTabId: string | null;
    openTab(manifest: ModuleManifest, opts?: OpenTabOptions): string | null;
    activateTab(id: string): void;
    closeTab(id: string): boolean;
    /** Close ignoring the active-task guard (used after user confirmation). */
    forceCloseTab(id: string): void;
    setTransientError(id: string, message: string | null): void;
    markCrashed(id: string, reason: string): void;
    releaseIframe(id: string): void;
    restoreIframe(manifest: ModuleManifest): string | null;
    setActiveTask(id: string, has: boolean): void;
}

const STORAGE_KEY = 'fusion.shell.tabs';

interface PersistedTab {
    id: string;
    manifestId: string;
    title: string;
    seq: number;
    hasActiveTask?: boolean;
    route?: string;
    pageTitle?: string;
}

function persist(tabs: ShellTab[]): void {
    try {
        const slim = tabs.map((t) => ({
            id: t.id,
            manifestId: t.manifestId,
            title: t.title,
            route: t.route,
            pageTitle: t.pageTitle,
            seq: t.seq,
            hasActiveTask: t.hasActiveTask,
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (err) {
        console.warn('[tabs] failed to persist tabs', err);
    }
}

export function loadPersistedTabs(): PersistedTab[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as PersistedTab[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((t) => t && typeof t.id === 'string' && typeof t.manifestId === 'string')
            .slice(0, MAX_TABS);
    } catch (err) {
        console.warn('[tabs] failed to load persisted tabs', err);
        return [];
    }
}

/** Dev HMR override (PRD §7.1): FUSION_DEV_MODULES=id:port,id:port. */
export function parseDevModules(raw: string | undefined): Map<string, string> {
    const map = new Map<string, string>();
    if (!raw) return map;
    for (const part of raw.split(',')) {
        const [id, port] = part.trim().split(':');
        if (id && port && /^\d+$/.test(port)) map.set(id, port);
    }
    return map;
}

export function entryFor(manifest: ModuleManifest, devModules: Map<string, string>): string {
    const port = devModules.get(manifest.id);
    if (port) return `http://localhost:${port}/?embedded=1`;
    return manifest.entry;
}

/** Deep-link src (C8 single form): `${entry}#${route}` with the same
 * entry rules (dev override / ?embedded=1) as plain tabs. */
export function srcFor(
    manifest: ModuleManifest,
    devModules: Map<string, string>,
    route?: string
): string {
    const base = entryFor(manifest, devModules);
    return route ? `${base}#${route}` : base;
}

export function tabTitle(manifest: ModuleManifest, seq: number, pageTitle?: string): string {
    const base = seq === 1 ? manifest.title : `${manifest.title} (${seq})`;
    return pageTitle ? `${base} · ${pageTitle}` : base;
}

export function newTab(
    manifest: ModuleManifest,
    devModules: Map<string, string>,
    seq = 1,
    opts?: { route?: string; pageTitle?: string }
): ShellTab {
    return {
        id: seq === 1 ? manifest.id : `${manifest.id}#${seq}`,
        manifestId: manifest.id,
        title: tabTitle(manifest, seq, opts?.pageTitle),
        status: 'active',
        seq,
        src: srcFor(manifest, devModules, opts?.route),
        route: opts?.route,
        pageTitle: opts?.pageTitle,
        hasActiveTask: false,
    };
}

let devModules: Map<string, string> = new Map();

/** Dev-mode iframe src overrides (set once from main.tsx). */
export function getDevModules(): Map<string, string> {
    return devModules;
}

export function setDevModules(map: Map<string, string>): void {
    devModules = map;
    console.log('[tabs] dev module overrides:', [...map.keys()]);
}

export const useTabs = create<TabsState>((set, get) => ({
    tabs: [],
    activeTabId: null,
    openTab(manifest, opts) {
        if (!opts?.multi) {
            const existing = get().tabs.find((t) => t.manifestId === manifest.id);
            if (existing) {
                if (existing.status === 'crashed') return get().restoreIframe(manifest);
                if (opts?.route && existing.src !== null) {
                    const want = srcFor(manifest, getDevModules(), opts.route);
                    // Same route: activate only (KeepAlive, no iframe reload);
                    // new route: re-src the tab (deep-link navigation, C8).
                    if (existing.src !== want) {
                        const title = tabTitle(
                            manifest,
                            existing.seq,
                            opts.pageTitle ?? existing.pageTitle
                        );
                        set((s) => ({
                            tabs: s.tabs.map((t) =>
                                t.id === existing.id
                                    ? {
                                          ...t,
                                          src: want,
                                          title,
                                          route: opts.route,
                                          pageTitle: opts.pageTitle ?? existing.pageTitle,
                                      }
                                    : t
                            ),
                            activeTabId: existing.id,
                        }));
                        persist(get().tabs);
                        return existing.id;
                    }
                }
                set({ activeTabId: existing.id });
                return existing.id;
            }
        }
        if (get().tabs.length >= MAX_TABS) {
            console.warn('[tabs] tab limit reached (12), refusing open:', manifest.id);
            return null;
        }
        const count = get().tabs.filter((t) => t.manifestId === manifest.id).length;
        const tab = newTab(manifest, getDevModules(), count + 1, opts);
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
        persist(get().tabs);
        return tab.id;
    },
    activateTab(id) {
        set({ activeTabId: id });
    },
    closeTab(id) {
        const tab = get().tabs.find((t) => t.id === id);
        if (tab?.hasActiveTask) {
            console.warn('[tabs] close blocked: active task in', id);
            return false;
        }
        set((s) => {
            const tabs = s.tabs.filter((t) => t.id !== id);
            const activeTabId =
                s.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId;
            return { tabs, activeTabId };
        });
        persist(get().tabs);
        return true;
    },
    forceCloseTab(id) {
        set((s) => ({
            tabs: s.tabs.map((t) => (t.id === id ? { ...t, hasActiveTask: false } : t)),
        }));
        get().closeTab(id);
    },
    setTransientError(id, message) {
        set((s) => ({
            tabs: s.tabs.map((t) => (t.id === id ? { ...t, transientError: message } : t)),
        }));
    },
    markCrashed(id, reason) {
        console.warn('[tabs] tab crashed:', id, reason);
        set((s) => ({
            tabs: s.tabs.map((t) =>
                t.id === id
                    ? { ...t, status: 'crashed' as const, crashedAt: Date.now(), src: null }
                    : t
            ),
        }));
        persist(get().tabs);
    },
    releaseIframe(id) {
        set((s) => ({
            tabs: s.tabs.map((t) => (t.id === id ? { ...t, src: null } : t)),
        }));
        persist(get().tabs);
    },
    restoreIframe(manifest) {
        const existing = get().tabs.find((t) => t.manifestId === manifest.id);
        if (!existing) return get().openTab(manifest);
        const restored: ShellTab = {
            ...existing,
            status: 'active',
            src: entryFor(manifest, getDevModules()),
            crashedAt: undefined,
        };
        set((s) => ({
            tabs: s.tabs.map((t) => (t.id === existing.id ? restored : t)),
            activeTabId: existing.id,
        }));
        persist(get().tabs);
        return existing.id;
    },
    setActiveTask(id, has) {
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, hasActiveTask: has } : t)) }));
        // Persist so refresh-restore knows the task was interrupted (PRD 6.1).
        persist(get().tabs);
    },
}));

/**
 * Refresh restore (PRD §6.1): rebuild tab skeletons from localStorage against
 * known manifests. Tabs that had active tasks are marked interrupted-retryable.
 */
export function restorePersistedTabs(
    manifests: ModuleManifest[],
    devModules: Map<string, string>
): number {
    const persisted = loadPersistedTabs();
    if (persisted.length === 0) return 0;
    const byId = new Map(manifests.map((m) => [m.id, m]));
    const restored: ShellTab[] = [];
    for (const p of persisted) {
        const manifest = byId.get(p.manifestId);
        if (!manifest) {
            console.warn('[tabs] skip restore, manifest missing:', p.manifestId);
            continue;
        }
        restored.push({
            id: p.id,
            manifestId: p.manifestId,
            title: p.title,
            status: 'active',
            seq: p.seq,
            src: srcFor(manifest, devModules, p.route),
            route: p.route,
            pageTitle: p.pageTitle,
            hasActiveTask: false,
            interrupted: p.hasActiveTask === true,
        });
    }
    if (restored.length === 0) return 0;
    const state = useTabs.getState();
    const known = new Set(state.tabs.map((t) => t.id));
    const merged = [...state.tabs, ...restored.filter((t) => !known.has(t.id))].slice(0, MAX_TABS);
    useTabs.setState({ tabs: merged, activeTabId: state.activeTabId ?? merged[0]?.id ?? null });
    console.log('[tabs] restored', merged.length, 'tabs from localStorage');
    return restored.length;
}
