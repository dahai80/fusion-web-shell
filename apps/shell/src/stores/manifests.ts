import * as api from '@/api/endpoints';
import type { Lang } from '@/stores/lang';
import type {
    DeviceMode,
    HomeCard,
    HomeProjectSource,
    ModuleManifest,
    ModulePage,
    NotificationKind,
    NotificationSource,
    SearchProvider,
} from '@/types/manifest';
import { create } from 'zustand';

export const CATEGORY_ORDER = ['platform', 'domain', 'infra', 'dev'] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

/** One sidebar row (issue #71): a flat module, or a collapsible group of them. */
export interface GroupEntry {
    kind: 'group';
    id: string;
    title: string;
    titleEn: string;
    members: ModuleManifest[];
}
export type MenuEntry = { kind: 'module'; m: ModuleManifest } | GroupEntry;

const CATEGORY_LABEL: Record<Category, string> = {
    platform: '平台',
    domain: '领域',
    infra: '基础设施',
    dev: '开发',
};

const CATEGORY_LABEL_EN: Record<Category, string> = {
    platform: 'Platform',
    domain: 'Domain',
    infra: 'Infrastructure',
    dev: 'Dev',
};

export function categoryLabel(c: Category, lang: Lang = 'zh'): string {
    return (lang === 'en' ? CATEGORY_LABEL_EN : CATEGORY_LABEL)[c] ?? c;
}

/** Spec S9: menu/tab titles follow host language, falling back to zh title. */
export function moduleTitle(m: ModuleManifest, lang: Lang = 'zh'): string {
    return lang === 'en' && m.title_en ? m.title_en : m.title;
}

export const CATEGORY_LABELS = CATEGORY_LABEL;

const NOTIFICATION_KINDS: readonly NotificationKind[] = ['approvals', 'runs', 'engine', 'tasks'];

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/** Schema v1 ext sanitizer (issue #24): shape-check, dedupe by id, cap size. */
function pickExt<T>(
    raw: unknown,
    validate: (rec: Record<string, unknown>) => T | null,
    keyOf: (item: T) => string,
    cap = 32
): T[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of raw) {
        if (out.length >= cap) break;
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const validated = validate(item as Record<string, unknown>);
        if (!validated || seen.has(keyOf(validated))) continue;
        seen.add(keyOf(validated));
        out.push(validated);
    }
    return out.length > 0 ? out : undefined;
}

function toSearchProvider(rec: Record<string, unknown>): SearchProvider | null {
    const id = str(rec.id);
    const label = str(rec.label);
    const endpoint = str(rec.endpoint);
    if (!id || !label || !endpoint || !endpoint.startsWith('/')) return null;
    const label_en = str(rec.label_en) ?? undefined;
    return { id, label, label_en, endpoint };
}

function toPage(rec: Record<string, unknown>): ModulePage | null {
    const route = str(rec.route);
    const title = str(rec.title);
    if (!route || !title || !route.startsWith('/') || route.includes('#')) return null;
    return { route, title, title_en: str(rec.title_en) ?? undefined };
}

function toNotificationSource(rec: Record<string, unknown>): NotificationSource | null {
    const base = toSearchProvider(rec);
    const kind = rec.kind;
    if (!base || typeof kind !== 'string' || !NOTIFICATION_KINDS.includes(kind as NotificationKind))
        return null;
    return { ...base, kind: kind as NotificationKind };
}

/** Home card sanitizer (issue #32): same route rules as pages. */
function toHomeCard(rec: Record<string, unknown>): HomeCard | null {
    const id = str(rec.id);
    const title = str(rec.title);
    const route = str(rec.route);
    if (!id || !title || !route || !route.startsWith('/') || route.includes('#')) return null;
    const card: HomeCard = {
        id,
        title,
        title_en: str(rec.title_en) ?? undefined,
        description: str(rec.description) ?? undefined,
        description_en: str(rec.description_en) ?? undefined,
        route,
    };
    if (rec.chip === true) card.chip = true;
    return card;
}

/** dto.home is {cards?, projects?}; absent or wrong shape = no contribution. */
function pickHome(raw: unknown): { cards?: HomeCard[]; projects?: HomeProjectSource[] } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const rec = raw as Record<string, unknown>;
    const cards = Array.isArray(rec.cards)
        ? pickExt(rec.cards, toHomeCard, (c) => c.id)
        : undefined;
    const projects = Array.isArray(rec.projects)
        ? pickExt(rec.projects, toHomeProjectSource, (p) => p.id)
        : undefined;
    return { cards, projects };
}

/** Home projects/spaces source sanitizer (issue #41): same rules as notifications. */
function toHomeProjectSource(rec: Record<string, unknown>): HomeProjectSource | null {
    const id = str(rec.id);
    const label = str(rec.label);
    const endpoint = str(rec.endpoint);
    if (!id || !label || !endpoint || !endpoint.startsWith('/')) return null;
    return { id, label, label_en: str(rec.label_en) ?? undefined, endpoint };
}

function toManifest(dto: api.ManifestDto): ModuleManifest {
    const home = pickHome(dto.home);
    return {
        id: dto.id,
        title: dto.title,
        title_en: dto.title_en,
        version: dto.version,
        path: dto.path,
        icon: dto.icon,
        entry: dto.entry,
        health: dto.health ?? null,
        backend: dto.backend ?? null,
        devices: (dto.devices ?? []).filter((d): d is DeviceMode =>
            ['desktop', 'mobile-ready', 'mobile-readonly', 'desktop-only'].includes(d)
        ),
        category: (CATEGORY_ORDER as readonly string[]).includes(dto.category)
            ? (dto.category as Category)
            : 'domain',
        unreachable: dto.unreachable,
        searchProviders: pickExt(dto.searchProviders, toSearchProvider, (p) => p.id),
        pages: pickExt(dto.pages, toPage, (p) => p.route),
        notifications: pickExt(dto.notifications, toNotificationSource, (p) => p.id),
        home: home.cards,
        homeProjects: home.projects,
        permissions_policy:
            dto.permissions_policy && dto.permissions_policy.length > 0
                ? dto.permissions_policy.filter((f) => POLICY_FEATURES.includes(f))
                : undefined,
        group: sanitizeGroupId(dto.group),
        group_title: sanitizeGroupTitle(dto.group_title),
        group_title_en: sanitizeGroupTitle(dto.group_title_en),
        sort: typeof dto.sort === 'number' && Number.isFinite(dto.sort) ? dto.sort : undefined,
    };
}

interface ManifestsState {
    manifests: ModuleManifest[];
    loaded: boolean;
    error: string | null;
    /** Modules heartbeat-expired (greyed, not removed — PRD §5.2). */
    unreachableIds: Set<string>;
    load(force?: boolean): Promise<void>;
    setUpstream(list: api.ManifestDto[]): void;
    markUnreachable(id: string, unreachable: boolean): void;
}

export const useManifests = create<ManifestsState>((set, get) => ({
    manifests: [],
    loaded: false,
    error: null,
    unreachableIds: new Set<string>(),
    // Throws so callers (useAutoRetry) can drive auto-retry with attempt display.
    async load(force) {
        if (get().loaded && !force) return;
        set({ error: null });
        try {
            const dtos = await api.fetchManifests();
            get().setUpstream(dtos);
            console.log('[manifests] loaded:', dtos.length);
        } catch (err) {
            console.error('[manifests] load failed', err);
            set({ error: (err as Error).message });
            throw err;
        }
    },
    setUpstream(list) {
        const manifests = list.map(toManifest);
        const unreachableIds = new Set(manifests.filter((m) => m.unreachable).map((m) => m.id));
        set({ manifests, loaded: true, unreachableIds });
    },
    markUnreachable(id, unreachable) {
        set((s) => {
            const next = new Set(s.unreachableIds);
            if (unreachable) next.add(id);
            else next.delete(id);
            return { unreachableIds: next };
        });
    },
}));

/**
 * Shell-layer device contract (spec §8.2, issue #21): mobile-readonly modules
 * render view-only on mobile regardless of module-side degradation, so each
 * module does not have to re-implement read-only enforcement.
 */
export function isReadonlyOnMobile(devices: DeviceMode[], viewport: 'desktop' | 'mobile'): boolean {
    return viewport === 'mobile' && devices.includes('mobile-readonly');
}

/** Feature tokens a manifest may ask the host iframe to delegate (issue #66). */
const POLICY_FEATURES: readonly string[] = ['microphone', 'camera'];

/**
 * Permissions-Policy `allow` value for a module iframe (issue #66): without
 * it a cross-origin iframe's getUserMedia is denied outright (NotAllowedError)
 * before any user prompt. Each declared feature is scoped to 'src' — the
 * frame's own origin only. Undeclared manifests get no allow attribute at all.
 */
export function iframeAllowPolicy(m: ModuleManifest): string | undefined {
    const features = (m.permissions_policy ?? []).filter((f) => POLICY_FEATURES.includes(f));
    if (features.length === 0) return undefined;
    return features.map((f) => `${f} 'src'`).join('; ');
}

/** Filter + group for menu render. desktop: all; mobile: hide desktop-only (PRD §8.1). */
export function menuGroups(
    manifests: ModuleManifest[],
    canView: (id: string) => boolean,
    mobile: boolean,
    lang: Lang = 'zh'
) {
    return CATEGORY_ORDER.map((cat) => ({
        category: cat,
        label: categoryLabel(cat, lang),
        items: menuEntries(
            manifests
                .filter((m) => m.category === cat && canView(m.id))
                .filter((m) => (mobile ? !m.devices.includes('desktop-only') : true)),
            lang
        ),
    })).filter((g) => g.items.length > 0);
}

/**
 * Menu grouping (issue #71): modules sharing a sanitized group render as one
 * group entry (members as its children); ungrouped modules stay flat. Members
 * order by their `sort` hint, then title. Groups sort by title after the
 * ungrouped modules of the same category.
 */
export function menuEntries(modules: ModuleManifest[], lang: Lang = 'zh'): MenuEntry[] {
    const byTitle = (a: ModuleManifest, b: ModuleManifest) =>
        moduleTitle(a, lang).localeCompare(moduleTitle(b, lang), lang === 'en' ? 'en-US' : 'zh-CN');
    const flat = modules.filter((m) => !m.group).sort(byTitle);
    const grouped = new Map<string, ModuleManifest[]>();
    for (const m of modules) {
        if (!m.group) continue;
        const list = grouped.get(m.group) ?? [];
        list.push(m);
        grouped.set(m.group, list);
    }
    const groups: MenuEntry[] = [...grouped.entries()]
        .map(([id, members]) => ({
            kind: 'group' as const,
            id,
            title: members[0]?.group_title ?? id,
            titleEn: members[0]?.group_title_en ?? id,
            members: members.sort(
                (a, b) =>
                    (a.sort ?? Number.POSITIVE_INFINITY) - (b.sort ?? Number.POSITIVE_INFINITY) ||
                    byTitle(a, b)
            ),
        }))
        .sort((a, b) => a.title.localeCompare(b.title, lang === 'en' ? 'en-US' : 'zh-CN'));
    return [...flat.map((m) => ({ kind: 'module' as const, m })), ...groups];
}

/** Group display name by language (issue #71); falls back to the group id. */
export function groupTitle(group: GroupEntry, lang: Lang = 'zh'): string {
    return lang === 'en' ? group.titleEn : group.title;
}

/** PRD §5.2 greyed-not-removed: a group greys out only when every member is offline. */
export function groupAllUnreachable(
    members: ModuleManifest[],
    unreachableIds: Set<string>
): boolean {
    return members.length > 0 && members.every((m) => unreachableIds.has(m.id));
}

/** Group id: short identifier token, used as DOM key and in persisted prefs. */
function sanitizeGroupId(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const id = raw.trim();
    if (id.length === 0 || id.length > 64 || !/^[A-Za-z0-9._-]+$/.test(id)) return undefined;
    return id;
}

function sanitizeGroupTitle(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const title = raw.trim();
    if (title.length === 0 || title.length > 64) return undefined;
    return title;
}
