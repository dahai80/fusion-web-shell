import * as api from '@/api/endpoints';
import type { DeviceMode, ModuleManifest } from '@/types/manifest';
import { create } from 'zustand';

export const CATEGORY_ORDER = ['platform', 'domain', 'infra', 'dev'] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_LABEL: Record<Category, string> = {
    platform: '平台',
    domain: '领域',
    infra: '基础设施',
    dev: '开发',
};

export function categoryLabel(c: Category): string {
    return CATEGORY_LABEL[c] ?? c;
}

export const CATEGORY_LABELS = CATEGORY_LABEL;

function toManifest(dto: api.ManifestDto): ModuleManifest {
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

/** Filter + group for menu render. desktop: all; mobile: hide desktop-only (PRD §8.1). */
export function menuGroups(
    manifests: ModuleManifest[],
    canView: (id: string) => boolean,
    mobile: boolean
) {
    return CATEGORY_ORDER.map((cat) => ({
        category: cat,
        label: CATEGORY_LABEL[cat],
        items: manifests
            .filter((m) => m.category === cat && canView(m.id))
            .filter((m) => (mobile ? !m.devices.includes('desktop-only') : true))
            .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    })).filter((g) => g.items.length > 0);
}
