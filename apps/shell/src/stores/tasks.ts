import { sharedClient } from '@/api/client';
import { useAuth } from '@/stores/auth';
import { useManifests } from '@/stores/manifests';
import { create } from 'zustand';

/**
 * Cross-module task feed (issue #33): polls manifest-declared sources with
 * kind `tasks` (same contract family as notifications), buckets items into
 * running / recent / scheduled for the Home page, and resolves pending
 * approvals inline (reject / allow once / always allow) without opening the
 * module. Per-source failure isolation: a broken source keeps its last good
 * snapshot so offline state stays readable.
 */

export interface TaskApproval {
    /** Gateway-absolute POST target for the three-action decision. */
    endpoint: string;
    prompt?: string;
    risk?: 'low' | 'medium' | 'high';
}

export interface TaskItem {
    /** Stable read key: `${moduleId}:${sourceId}:${itemId}`. */
    id: string;
    moduleId: string;
    sourceId: string;
    itemId: string;
    title: string;
    /** Module vocabulary; the host buckets it via taskBucket(). */
    status: string;
    progress?: number;
    pendingApproval?: TaskApproval;
    artifacts?: number;
    updatedAt?: string;
    /** Module-relative deep link. */
    route?: string;
}

export type TaskBucket = 'running' | 'recent' | 'scheduled';
export type ApprovalAction = 'reject' | 'allow_once' | 'always_allow';

const RECENT_STATUSES = new Set(['done', 'succeeded', 'failed', 'error', 'cancelled', 'completed']);

export function taskBucket(t: Pick<TaskItem, 'status'>): TaskBucket {
    if (t.status === 'scheduled') return 'scheduled';
    if (RECENT_STATUSES.has(t.status)) return 'recent';
    return 'running';
}

export type TaskFetchFn = (path: string) => Promise<{ items?: unknown }>;
export type TaskPostFn = (path: string, body: unknown) => Promise<unknown>;

let fetcher: TaskFetchFn = async (path) => {
    try {
        return await sharedClient().get(path, { quiet: true });
    } catch (err) {
        console.warn('[tasks] fetch failed:', path, err);
        return {};
    }
};

let poster: TaskPostFn = (path, body) => sharedClient().post(path, body);

/** Test seams: swap the HTTP layer (production default = sharedClient). */
export function setFetcher(fn: TaskFetchFn): void {
    fetcher = fn;
}

export function setPoster(fn: TaskPostFn): void {
    poster = fn;
}

const MAX_ITEMS_PER_SOURCE = 32;

function toTask(moduleId: string, sourceId: string, raw: unknown): TaskItem | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const itemId = typeof rec.id === 'string' ? rec.id.trim() : '';
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    if (!itemId || !title) return null;
    const route =
        typeof rec.route === 'string' && rec.route.startsWith('/') ? rec.route : undefined;
    const progress =
        typeof rec.progress === 'number' && Number.isFinite(rec.progress)
            ? Math.max(0, Math.min(100, Math.round(rec.progress)))
            : undefined;
    let pendingApproval: TaskApproval | undefined;
    if (rec.pending_approval && typeof rec.pending_approval === 'object') {
        const ap = rec.pending_approval as Record<string, unknown>;
        const endpoint = typeof ap.endpoint === 'string' ? ap.endpoint.trim() : '';
        if (endpoint.startsWith('/')) {
            pendingApproval = {
                endpoint,
                prompt: typeof ap.prompt === 'string' ? ap.prompt : undefined,
                risk:
                    ap.risk === 'low' || ap.risk === 'medium' || ap.risk === 'high'
                        ? ap.risk
                        : undefined,
            };
        }
    }
    return {
        id: `${moduleId}:${sourceId}:${itemId}`,
        moduleId,
        sourceId,
        itemId,
        title,
        status: typeof rec.status === 'string' ? rec.status : 'running',
        progress,
        pendingApproval,
        artifacts: typeof rec.artifacts === 'number' ? rec.artifacts : undefined,
        updatedAt: typeof rec.updated_at === 'string' ? rec.updated_at : undefined,
        route,
    };
}

interface TasksState {
    items: TaskItem[];
    /** Last good snapshot per `${moduleId}:${sourceId}` (offline cache). */
    lastGood: Map<string, TaskItem[]>;
    polling: boolean;
    pollNow(): Promise<void>;
    start(intervalMs?: number): Promise<void>;
    stop(): void;
    /** POST the three-action decision; drops the item only on success. */
    approve(taskId: string, action: ApprovalAction): Promise<void>;
    byBucket(bucket: TaskBucket): TaskItem[];
}

let timer: ReturnType<typeof setInterval> | null = null;
let generation = 0;

export const useTasks = create<TasksState>((set, get) => ({
    items: [],
    lastGood: new Map(),
    polling: false,

    async pollNow() {
        const auth = useAuth.getState();
        if (auth.status !== 'authed' || !auth.token) {
            console.log('[tasks] session not ready, skipping poll');
            return;
        }
        const { manifests, unreachableIds } = useManifests.getState();
        const canView = useAuth.getState().canView;
        const targets = manifests.flatMap((m) =>
            m.unreachable || unreachableIds.has(m.id) || !canView(m.id)
                ? []
                : (m.notifications ?? []).filter((s) => s.kind === 'tasks').map((s) => ({ m, s }))
        );
        const settled = await Promise.allSettled(
            targets.map(async ({ m, s }) => {
                const data = await fetcher(s.endpoint);
                const raw = Array.isArray(data?.items) ? data.items : [];
                const items = raw
                    .slice(0, MAX_ITEMS_PER_SOURCE)
                    .map((r) => toTask(m.id, s.id, r))
                    .filter((x): x is TaskItem => x !== null);
                return { key: `${m.id}:${s.id}`, items };
            })
        );
        const lastGood = new Map(get().lastGood);
        for (const r of settled) {
            if (r.status === 'fulfilled') {
                lastGood.set(r.value.key, r.value.items);
            } else {
                console.warn('[tasks] source rejected, keeping cached snapshot:', r.reason);
            }
        }
        const items = [...lastGood.values()].flat();
        set({ items, lastGood });
        console.log('[tasks] polled', targets.length, 'sources,', items.length, 'items');
    },

    async start(intervalMs = 30000) {
        if (get().polling || timer !== null) return;
        const gen = ++generation;
        set({ polling: true });
        await get().pollNow();
        if (gen !== generation || !get().polling || timer !== null) return;
        timer = setInterval(() => {
            void get().pollNow();
        }, intervalMs);
        console.log('[tasks] polling started, interval', intervalMs);
    },

    stop() {
        generation += 1;
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
        if (get().polling) set({ polling: false });
    },

    async approve(taskId, action) {
        const task = get().items.find((i) => i.id === taskId);
        if (!task?.pendingApproval) {
            console.warn('[tasks] approve: no pending approval on task:', taskId);
            return;
        }
        try {
            await poster(task.pendingApproval.endpoint, { id: task.itemId, action });
            console.log('[tasks] approval applied:', taskId, action);
        } catch (err) {
            console.error('[tasks] approval failed, keeping card:', taskId, err);
            throw err;
        }
        set((s) => {
            const key = `${task.moduleId}:${task.sourceId}`;
            const cached = s.lastGood.get(key) ?? [];
            s.lastGood.set(
                key,
                cached.filter((i) => i.id !== taskId)
            );
            return { items: s.items.filter((i) => i.id !== taskId) };
        });
    },

    byBucket(bucket) {
        return get().items.filter((i) => taskBucket(i) === bucket);
    },
}));
