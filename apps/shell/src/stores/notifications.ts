import { sharedClient } from '@/api/client';
import { stampLastSeen } from '@/lib/sidebarTree';
import { useAuth } from '@/stores/auth';
import { useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import type { NotificationKind } from '@/types/manifest';
import { create } from 'zustand';

/**
 * Notification center store (issue #24, G11/C3): polls manifest-declared
 * sources over the existing gateway surface (host Bearer, no new backend),
 * aggregates approvals / run terminal states / engine events, keeps a
 * persisted read set, and deep-links items into module tabs.
 */

export interface NotificationItem {
    id: string;
    sourceId: string;
    moduleId: string;
    kind: NotificationKind;
    title: string;
    route?: string;
    level: 'info' | 'warning' | 'error';
    ts?: string;
}

export type NotificationFetchFn = (path: string) => Promise<{ items?: unknown }>;

let fetcher: NotificationFetchFn = (path) => sharedClient().get(path, { quiet: true });

/** Test seam: swap the HTTP layer (production default = sharedClient). */
export function setFetcher(fn: NotificationFetchFn): void {
    fetcher = fn;
}

const READ_KEY = 'fusion.shell.notifications.read';
const MAX_READ = 200;
const MAX_ITEMS_PER_SOURCE = 32;

// #93: a 502/503 mute (issue #46) must not grey a module forever — the
// upstream usually recovers (engine restart, memory pressure passing), so a
// muted module is re-probed once this window elapses and a success clears
// the client-side mark.
const UNREACHABLE_RECHECK_MS = 60_000;
const recheckAt = new Map<string, number>();

/** Test seam: direct access to the client-side recheck deadlines. */
export function recheckDeadlines(): Map<string, number> {
    return recheckAt;
}

function loadReadIds(): Set<string> {
    try {
        const raw = localStorage.getItem(READ_KEY);
        const list = raw ? (JSON.parse(raw) as unknown) : [];
        return new Set(
            Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
        );
    } catch (err) {
        console.warn('[notifications] read set load failed', err);
        return new Set();
    }
}

function saveReadIds(readIds: Set<string>): void {
    try {
        const capped = [...readIds].slice(-MAX_READ);
        localStorage.setItem(READ_KEY, JSON.stringify(capped));
    } catch (err) {
        console.warn('[notifications] read set persist failed', err);
    }
}

interface NotificationsState {
    items: NotificationItem[];
    readIds: Set<string>;
    polling: boolean;
    unreadCount(): number;
    pollNow(): Promise<void>;
    start(intervalMs?: number): Promise<void>;
    stop(): void;
    markRead(id: string): void;
    markAllRead(): void;
    openItem(id: string): void;
}

let timer: ReturnType<typeof setInterval> | null = null;
let generation = 0;

export const useNotifications = create<NotificationsState>((set, get) => ({
    items: [],
    readIds: loadReadIds(),
    polling: false,

    unreadCount() {
        const readIds = get().readIds;
        return get().items.filter((i) => !readIds.has(i.id)).length;
    },

    async pollNow() {
        // Issue #28: background polls wait for a confirmed session; skip a
        // round silently while login/restore is still in flight.
        const auth = useAuth.getState();
        if (auth.status !== 'authed' || !auth.token) {
            console.log('[notifications] session not ready, skipping poll');
            return;
        }
        const { manifests, unreachableIds } = useManifests.getState();
        const canView = useAuth.getState().canView;
        const now = Date.now();
        const targets = manifests.flatMap((m) => {
            if (!canView(m.id)) return [];
            // Gateway heartbeat says down (PRD §5.2): authoritative, hard skip.
            if (m.unreachable) return [];
            // Client-side 502/503 mark (#46): muted only until the recheck
            // deadline, then probed again so recovery clears the mark (#93).
            if (unreachableIds.has(m.id) && (recheckAt.get(m.id) ?? 0) > now) return [];
            // kind:tasks feeds the Home task cards (issue #33), not the bell.
            return (m.notifications ?? []).filter((s) => s.kind !== 'tasks').map((s) => ({ m, s }));
        });
        const settled = await Promise.all(
            targets.map(async ({ m, s }) => {
                try {
                    const data = await fetcher(s.endpoint);
                    // #112: a successful answer stamps last-seen for the
                    // offline tooltip's "last online" line.
                    stampLastSeen([m.id]);
                    // #93: a source answering again clears a client-side mark —
                    // the mute was a liveness hint, not a verdict.
                    if (useManifests.getState().unreachableIds.has(m.id)) {
                        useManifests.getState().markUnreachable(m.id, false);
                        recheckAt.delete(m.id);
                        console.log('[notifications] upstream recovered:', m.id);
                    }
                    const items = Array.isArray(data?.items) ? data.items : [];
                    return items
                        .slice(0, MAX_ITEMS_PER_SOURCE)
                        .map((raw): NotificationItem | null => {
                            if (!raw || typeof raw !== 'object') return null;
                            const rec = raw as Record<string, unknown>;
                            const itemId = typeof rec.id === 'string' ? rec.id.trim() : '';
                            const title = typeof rec.title === 'string' ? rec.title.trim() : '';
                            if (!itemId || !title) return null;
                            const level =
                                rec.level === 'warning' || rec.level === 'error'
                                    ? rec.level
                                    : 'info';
                            const route =
                                typeof rec.route === 'string' && rec.route.startsWith('/')
                                    ? rec.route
                                    : undefined;
                            return {
                                id: `${m.id}:${s.id}:${itemId}`,
                                sourceId: s.id,
                                moduleId: m.id,
                                kind: s.kind,
                                title,
                                route,
                                level,
                                ts: typeof rec.ts === 'string' ? rec.ts : undefined,
                            };
                        })
                        .filter((x): x is NotificationItem => x !== null);
                } catch (err) {
                    // Issue #46: 502/503 = the module's upstream refuses
                    // connections (stale registration). Mark it unreachable
                    // and mute it until the recheck deadline — later polls
                    // inside the window skip it, killing the 503 spam (#93
                    // made the mute expire instead of lasting a session).
                    const status = (err as { status?: number })?.status;
                    if (status === 502 || status === 503) {
                        useManifests.getState().markUnreachable(m.id, true);
                        recheckAt.set(m.id, Date.now() + UNREACHABLE_RECHECK_MS);
                        console.log(
                            '[notifications] upstream down, muted module:',
                            m.id,
                            `recheck in ${UNREACHABLE_RECHECK_MS / 1000}s`
                        );
                    } else {
                        console.warn('[notifications] source rejected:', s.endpoint, err);
                    }
                    return [];
                }
            })
        );
        const merged: NotificationItem[] = settled.flat();
        set({ items: merged });
        console.log('[notifications] polled', targets.length, 'sources,', merged.length, 'items');
    },

    async start(intervalMs = 30000) {
        if (get().polling || timer !== null) return;
        const gen = ++generation;
        set({ polling: true });
        await get().pollNow();
        // A stop() (or a newer start) during the first poll invalidates this
        // start — never install an orphan interval (review fix #1).
        if (gen !== generation || !get().polling || timer !== null) return;
        timer = setInterval(() => {
            void get().pollNow();
        }, intervalMs);
        console.log('[notifications] polling started, interval', intervalMs);
    },

    stop() {
        generation += 1;
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
        if (get().polling) set({ polling: false });
    },

    markRead(id) {
        set((s) => {
            if (s.readIds.has(id)) return s;
            const readIds = new Set(s.readIds);
            readIds.add(id);
            saveReadIds(readIds);
            return { readIds };
        });
    },

    markAllRead() {
        set((s) => {
            const readIds = new Set(s.readIds);
            for (const item of s.items) readIds.add(item.id);
            saveReadIds(readIds);
            return { readIds };
        });
    },

    openItem(id) {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;
        get().markRead(id);
        const manifest = useManifests.getState().manifests.find((m) => m.id === item.moduleId);
        if (!manifest) {
            console.warn('[notifications] manifest missing for item:', id);
            return;
        }
        useTabs.getState().openTab(manifest, {
            route: item.route,
            pageTitle: item.title.slice(0, 24),
        });
    },
}));
