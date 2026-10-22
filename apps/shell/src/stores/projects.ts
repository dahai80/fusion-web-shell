import { sharedClient } from '@/api/client';
import { useAuth } from '@/stores/auth';
import { useManifests } from '@/stores/manifests';
import { create } from 'zustand';

/**
 * Cross-module projects/spaces feed (issue #41): polls manifest-declared
 * `home.projects` sources (gateway #273) and aggregates each module's
 * spaces/projects for the Home "项目/空间" section. Items deep-link into
 * the module's space view via the standard `${entry}#${route}` form.
 * Per-source failure isolation: a broken source keeps its last good
 * snapshot so offline state stays readable.
 */

export interface ProjectItem {
    /** Stable read key: `${moduleId}:${sourceId}:${itemId}`. */
    id: string;
    moduleId: string;
    sourceId: string;
    itemId: string;
    title: string;
    description?: string;
    updatedAt?: string;
    /** Module-relative deep link into the space view. */
    route?: string;
}

export type ProjectFetchFn = (path: string) => Promise<{ items?: unknown }>;

let fetcher: ProjectFetchFn = async (path) => {
    try {
        return await sharedClient().get(path, { quiet: true });
    } catch (err) {
        console.warn('[projects] fetch failed:', path, err);
        return {};
    }
};

/** Test seam: swap the HTTP layer (production default = sharedClient). */
export function setFetcher(fn: ProjectFetchFn): void {
    fetcher = fn;
}

const MAX_ITEMS_PER_SOURCE = 32;

function toProject(moduleId: string, sourceId: string, raw: unknown): ProjectItem | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const itemId = typeof rec.id === 'string' ? rec.id.trim() : '';
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    // route is required: a space without a deep link is not actionable.
    const route =
        typeof rec.route === 'string' && rec.route.startsWith('/') && !rec.route.includes('#')
            ? rec.route
            : null;
    if (!itemId || !title || !route) return null;
    return {
        id: `${moduleId}:${sourceId}:${itemId}`,
        moduleId,
        sourceId,
        itemId,
        title,
        description: typeof rec.description === 'string' ? rec.description : undefined,
        updatedAt: typeof rec.updated_at === 'string' ? rec.updated_at : undefined,
        route,
    };
}

interface ProjectsState {
    items: ProjectItem[];
    /** Last good snapshot per `${moduleId}:${sourceId}` (offline cache). */
    lastGood: Map<string, ProjectItem[]>;
    polling: boolean;
    pollNow(): Promise<void>;
    start(intervalMs?: number): Promise<void>;
    stop(): void;
    byModule(moduleId: string): ProjectItem[];
}

let timer: ReturnType<typeof setInterval> | null = null;
let generation = 0;

export const useProjects = create<ProjectsState>((set, get) => ({
    items: [],
    lastGood: new Map(),
    polling: false,

    async pollNow() {
        const auth = useAuth.getState();
        if (auth.status !== 'authed' || !auth.token) {
            console.log('[projects] session not ready, skipping poll');
            return;
        }
        const { manifests, unreachableIds } = useManifests.getState();
        const canView = useAuth.getState().canView;
        const targets = manifests.flatMap((m) =>
            m.unreachable || unreachableIds.has(m.id) || !canView(m.id)
                ? []
                : (m.homeProjects ?? []).map((s) => ({ m, s }))
        );
        const settled = await Promise.allSettled(
            targets.map(async ({ m, s }) => {
                const data = await fetcher(s.endpoint);
                const raw = Array.isArray(data?.items) ? data.items : [];
                const items = raw
                    .slice(0, MAX_ITEMS_PER_SOURCE)
                    .map((r) => toProject(m.id, s.id, r))
                    .filter((x): x is ProjectItem => x !== null);
                return { key: `${m.id}:${s.id}`, items };
            })
        );
        const lastGood = new Map(get().lastGood);
        for (const r of settled) {
            if (r.status === 'fulfilled') {
                lastGood.set(r.value.key, r.value.items);
            } else {
                console.warn('[projects] source rejected, keeping cached snapshot:', r.reason);
            }
        }
        const items = [...lastGood.values()].flat();
        set({ items, lastGood });
        console.log('[projects] polled', targets.length, 'sources,', items.length, 'items');
    },

    async start(intervalMs = 60000) {
        if (get().polling || timer !== null) return;
        const gen = ++generation;
        set({ polling: true });
        await get().pollNow();
        if (gen !== generation || !get().polling || timer !== null) return;
        timer = setInterval(() => {
            void get().pollNow();
        }, intervalMs);
        console.log('[projects] polling started, interval', intervalMs);
    },

    stop() {
        generation += 1;
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
        if (get().polling) set({ polling: false });
    },

    byModule(moduleId) {
        return get().items.filter((i) => i.moduleId === moduleId);
    },
}));
