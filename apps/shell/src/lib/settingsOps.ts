/**
 * Pure helpers for the f-ecommerce migration E6 (issue #42): sanitizers for
 * the platform/audit/roles admin surfaces plus the menu-matrix collector.
 * Endpoint contracts live in docs/f-ecommerce-migration-e6.md; the gateway
 * ships them behind /api/v1/shell/* (degradation handled at the pages).
 */

export interface AdapterRow {
    platform: string;
    configured: boolean;
    enabled: boolean;
    /** Server-masked credential projection (e.g. {"access_token": "…ab12"}). */
    credentials_masked: Record<string, string>;
    rate_limit_rps: number;
    jitter_ms: number;
}

export interface ConnectorRow {
    id: string;
    kind: string;
    operations: string[];
    problems: string[];
}

export const AUDIT_CLASSES = ['read', 'write', 'approval', 'agent_run', 'config', 'auth'] as const;
export type AuditClass = (typeof AUDIT_CLASSES)[number];

export interface AuditEntry {
    ts: number;
    user: string;
    role: string;
    action_class: string;
    method: string;
    path: string;
    outcome: 'ok' | 'denied' | 'error' | string;
    duration_ms: number;
    integrity_ok: boolean;
}

export interface RoleRow {
    name: string;
    builtin: boolean;
    write_classes: string[];
    description: string;
    user_count: number;
}

export interface MenuPermissionsDoc {
    menus: Array<{ id: string; label: string; href: string; roles: string[] }>;
}

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function sanitizeAdapters(raw: unknown): AdapterRow[] {
    const rows = raw && typeof raw === 'object' ? (raw as { adapters?: unknown }).adapters : null;
    if (!Array.isArray(rows)) return [];
    return rows
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({
            platform: str(r.platform),
            configured: r.configured === true,
            enabled: r.enabled === true,
            credentials_masked:
                r.credentials_masked && typeof r.credentials_masked === 'object'
                    ? (r.credentials_masked as Record<string, string>)
                    : {},
            rate_limit_rps: num(r.rate_limit_rps),
            jitter_ms: num(r.jitter_ms),
        }))
        .filter((r) => r.platform.length > 0);
}

export function sanitizeConnectors(raw: unknown): ConnectorRow[] {
    const rows =
        raw && typeof raw === 'object' ? (raw as { connectors?: unknown }).connectors : null;
    if (!Array.isArray(rows)) return [];
    return rows
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({
            id: str(r.id),
            kind: str(r.kind),
            operations: Array.isArray(r.operations)
                ? r.operations.filter((o): o is string => typeof o === 'string')
                : [],
            problems: Array.isArray(r.problems)
                ? r.problems.filter((p): p is string => typeof p === 'string')
                : [],
        }))
        .filter((r) => r.id.length > 0);
}

export function sanitizeAudit(raw: unknown): AuditEntry[] {
    const rows = raw && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : null;
    if (!Array.isArray(rows)) return [];
    return rows
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({
            ts: num(r.ts),
            user: str(r.user),
            role: str(r.role),
            action_class: str(r.action_class),
            method: str(r.method),
            path: str(r.path),
            outcome: str(r.outcome, 'error'),
            duration_ms: num(r.duration_ms),
            integrity_ok: r.integrity_ok === true,
        }));
}

export function sanitizeRoles(raw: unknown): { roles: RoleRow[]; writeClasses: string[] } {
    const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const roles = Array.isArray(body.roles) ? body.roles : [];
    return {
        roles: roles
            .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
            .map((r) => ({
                name: str(r.name),
                builtin: r.builtin === true,
                write_classes: Array.isArray(r.write_classes)
                    ? r.write_classes.filter((c): c is string => typeof c === 'string')
                    : [],
                description: str(r.description),
                user_count: num(r.user_count),
            }))
            .filter((r) => r.name.length > 0),
        writeClasses: Array.isArray(body.write_classes)
            ? body.write_classes.filter((c): c is string => typeof c === 'string')
            : [],
    };
}

/** Effective menus doc: overrides win when non-empty, else defaults (audit empty = unset). */
export function effectiveMenus(raw: unknown): MenuPermissionsDoc {
    const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const pick = (doc: unknown): MenuPermissionsDoc | null => {
        if (!doc || typeof doc !== 'object') return null;
        const menus = (doc as { menus?: unknown }).menus;
        if (!Array.isArray(menus) || menus.length === 0) return null;
        return {
            menus: menus
                .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
                .map((m) => ({
                    id: str(m.id),
                    label: str(m.label) || str(m.id),
                    href: str(m.href),
                    roles: Array.isArray(m.roles)
                        ? m.roles.filter((r): r is string => typeof r === 'string')
                        : [],
                }))
                .filter((m) => m.id.length > 0 && m.href.length > 0),
        };
    };
    const overrides = pick(body.overrides);
    if (overrides && overrides.menus.length > 0) return overrides;
    const defaults = pick(body.defaults);
    return defaults ?? { menus: [] };
}

/**
 * Menu-matrix collector (users.html collectPermissions): rebuild the menus
 * doc from the checkbox grid state. The grid is the source of truth — roles
 * may be added to or removed from a menu — so the payload carries, per menu,
 * exactly the roles whose checkbox is on.
 */
export function collectMenuMatrix(
    menus: MenuPermissionsDoc['menus'],
    allRoles: string[],
    checked: (role: string, menuIndex: number) => boolean
): MenuPermissionsDoc {
    return {
        menus: menus.map((m, i) => ({
            ...m,
            roles: allRoles.filter((r) => checked(r, i)),
        })),
    };
}

export function auditQueryString(user: string, actionClass: string): string {
    const params = new URLSearchParams();
    if (user.trim()) params.set('user', user.trim());
    if (actionClass) params.set('action_class', actionClass);
    const q = params.toString();
    return q ? `?${q}` : '';
}

/** Connector sync example (users of settings.html loadExample) — kept verbatim. */
export const SYNC_EXAMPLE = {
    id: 'aws-catalog-sync',
    kind: 'rest',
    comment:
        'Credentials are resolved from the vault: save them once under' +
        " Adapters with a platform row named 'aws-catalog-sync' (credential_ref).",
    credential_ref: 'aws-catalog-sync',
    auth: { type: 'bearer', credential_fields: ['token'] },
    base_url: 'https://your-api.example.com',
    operations: {
        'product.list': {
            method: 'GET',
            path: '/v1/products',
            params: { since: '{since}' },
            response: { items: '$.products' },
        },
        'product.create': { method: 'POST', path: '/v1/products' },
        'inventory.get': {
            method: 'GET',
            path: '/v1/inventory/{sku_id}',
            response: { available: '$.available' },
        },
        'inventory.set': { method: 'POST', path: '/v1/inventory/{sku_id}' },
        'order.list': {
            method: 'GET',
            path: '/v1/orders',
            params: { updated_after: '{since}' },
            response: { orders: '$.orders' },
        },
    },
    rate_limit_rps: 2,
    jitter_ms: 200,
    error_code_map: {
        '403': 'auth failed — check vault credentials',
        '429': 'rate limited — retry later',
    },
};

/** Parse a JSON textarea payload; returns an error message on invalid JSON. */
export function parseJsonInput(
    text: string
): { ok: true; value: unknown } | { ok: false; error: string } {
    try {
        return { ok: true, value: JSON.parse(text || '{}') };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}
