import type { Lang } from '@/stores/lang';
import { SECTION_ORDER, type SectionId } from '@/stores/manifests';
import { sectionLabel } from '@/stores/manifests';
import type { ModuleManifest } from '@/types/manifest';

/**
 * Three-state product catalog (issue #116, gateway contract
 * fusion-gateway#488): the sidebar shows the whole product line — running
 * (registered + healthy), installed-stopped (registered, unreachable) and
 * not-installed (catalog-only) — so the full line stays browsable. Until
 * the gateway ships /v1/catalog the store pins gatewayPending and the
 * sidebar renders as today.
 */

export type CatalogState = 'running' | 'stopped' | 'not_installed';

export interface CatalogEntry {
    id: string;
    title: string;
    title_en?: string;
    /** Gateway catalog ships title_cn as the zh display string (fusion-gateway#504). */
    title_cn?: string;
    category: string;
    description?: string;
    description_en?: string;
    description_cn?: string;
    /** Approx install footprint, human-readable (e.g. "1.2 GB"). */
    footprint?: string;
    /** Model class / suggested model the product needs. */
    model_requirement?: string;
    dependencies: string[];
    repo_url?: string;
}

/** First non-empty string among the candidates. */
const pickStr = (...vals: unknown[]): string | undefined => {
    for (const v of vals) {
        if (typeof v === 'string' && v.length > 0) return v;
    }
    return undefined;
};

/** Defensive parse of an untrusted catalog payload. Accepts both the
 * shell-native shape (`title`/`description`) and the gateway catalog shape
 * (`title_en`/`title_cn`, `description_en`/`description_cn`, `repo`,
 * `model_class` — fusion-gateway#504): zh display falls back through
 * title → title_cn → title_en. */
export function sanitizeCatalog(raw: unknown): CatalogEntry[] {
    if (!raw || typeof raw !== 'object') return [];
    const list = Array.isArray(raw)
        ? raw
        : ((raw as Record<string, unknown>).items ??
          (raw as Record<string, unknown>).products ??
          (raw as Record<string, unknown>).catalog);
    if (!Array.isArray(list)) return [];
    const out: CatalogEntry[] = [];
    for (const rec of list) {
        if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
        const r = rec as Record<string, unknown>;
        const id = typeof r.id === 'string' ? r.id : '';
        const title = pickStr(r.title, r.title_cn, r.title_en);
        if (!id || !title) continue;
        out.push({
            id,
            title,
            title_en: pickStr(r.title_en),
            title_cn: pickStr(r.title_cn),
            category: typeof r.category === 'string' ? r.category : '',
            description: pickStr(r.description, r.description_cn, r.description_en),
            description_en: pickStr(r.description_en),
            description_cn: pickStr(r.description_cn),
            footprint: pickStr(r.footprint),
            dependencies: Array.isArray(r.dependencies)
                ? r.dependencies.filter((d): d is string => typeof d === 'string' && d.length > 0)
                : [],
            repo_url: pickStr(r.repo_url, r.repo),
            model_requirement: pickStr(r.model_requirement, r.model_class),
        });
    }
    return out;
}

export interface CatalogRow {
    entry: CatalogEntry;
    state: CatalogState;
    manifest?: ModuleManifest;
}

/** Merge catalog x manifest registry x health (#116): one row per entry. */
export function catalogRows(
    entries: CatalogEntry[],
    manifests: ModuleManifest[],
    unreachableIds: Set<string>
): CatalogRow[] {
    const byId = new Map(manifests.map((m) => [m.id, m]));
    return entries.map((entry) => {
        const manifest = byId.get(entry.id);
        if (!manifest) return { entry, state: 'not_installed' as const };
        return {
            entry,
            state: unreachableIds.has(entry.id) ? ('stopped' as const) : ('running' as const),
            manifest,
        };
    });
}

/** Sidebar section for a catalog entry: installed rows follow their
 * manifest; not-installed rows map id → section (unknown → domain). */
export function sectionOfEntry(
    row: CatalogRow,
    sectionOfManifest: (id: string) => SectionId
): SectionId {
    if (row.manifest) return sectionOfManifest(row.manifest.id);
    return sectionOfManifest(row.entry.id);
}

/** Section-grouped rows with installed entries sorted before
 * not-installed ones inside each group (#116 AC). */
export function groupedCatalogRows(
    rows: CatalogRow[],
    sectionOfManifest: (id: string) => SectionId,
    lang: Lang = 'zh'
): { section: SectionId; label: string; notInstalled: CatalogRow[] }[] {
    const buckets = new Map<SectionId, CatalogRow[]>();
    for (const row of rows) {
        if (row.state !== 'not_installed') continue;
        const s = sectionOfEntry(row, sectionOfManifest);
        const list = buckets.get(s) ?? [];
        list.push(row);
        buckets.set(s, list);
    }
    return SECTION_ORDER.filter((s) => buckets.has(s)).map((s) => ({
        section: s,
        label: sectionLabel(s, lang),
        notInstalled: buckets.get(s)!,
    }));
}

/** Bilingual install command handed off from the item panel (#116). */
export function installCommand(entry: CatalogEntry): string {
    return `fusion install ${entry.id}`;
}
