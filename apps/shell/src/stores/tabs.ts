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
}

export interface TabsState {
    tabs: ShellTab[];
    activeTabId: string | null;
    openTab(manifest: ModuleManifest, opts?: { multi?: boolean }): string | null;
    activateTab(id: string): void;
    closeTab(id: string): boolean;
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
}

function persist(tabs: ShellTab[]): void {
    try {
        const slim = tabs.map((t) => ({
            id: t.id,
            manifestId: t.manifestId,
            title: t.title,
            seq: t.seq,
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

export function newTab(
    manifest: ModuleManifest,
    devModules: Map<string, string>,
    seq = 1
): ShellTab {
    return {
        id: seq === 1 ? manifest.id : `${manifest.id}#${seq}`,
        manifestId: manifest.id,
        title: seq === 1 ? manifest.title : `${manifest.title} (${seq})`,
        status: 'active',
        seq,
        src: entryFor(manifest, devModules),
        hasActiveTask: false,
    };
}

let devModules: Map<string, string> = new Map();

export function setDevModules(map: Map<string, string>): void {
    devModules = map;
    console.log('[tabs] dev module overrides:', [...map.keys()]);
}

function getDevModules(): Map<string, string> {
    return devModules;
}

export const useTabs = create<TabsState>((set, get) => ({
    tabs: [],
    activeTabId: null,
    openTab(manifest, opts) {
        if (!opts?.multi) {
            const existing = get().tabs.find((t) => t.manifestId === manifest.id);
            if (existing) {
                if (existing.status === 'crashed') return get().restoreIframe(manifest);
                set({ activeTabId: existing.id });
                return existing.id;
            }
        }
        if (get().tabs.length >= MAX_TABS) {
            console.warn('[tabs] tab limit reached (12), refusing open:', manifest.id);
            return null;
        }
        const count = get().tabs.filter((t) => t.manifestId === manifest.id).length;
        const tab = newTab(manifest, getDevModules(), count + 1);
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
    },
}));
