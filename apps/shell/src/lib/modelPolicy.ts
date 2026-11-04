import type { ShellModel } from '@/lib/modelCatalog';

/**
 * Model-policy plane (issue #114, gateway contract fusion-gateway#486):
 * four-layer chain — module override > user preference (allowlist-
 * constrained) > tenant global default > build-time fallback ('' = gateway
 * routing default). Until the gateway ships #486 the shell degrades: policy
 * endpoints 404 -> gatewayPending, resolution falls back to user pref only.
 */

export type PrivacyMode = 'all' | 'local_only';

export interface ModelPolicy {
    /** Tenant global default; '' = no tenant default. */
    default_model: string;
    /** Per-module override, keyed by manifest id (model_capable modules). */
    module_overrides: Record<string, string>;
    /** Models a user may pick; empty = unrestricted. */
    user_allowlist: string[];
    /** 'local_only' hides cloud models from pickers and resolution. */
    privacy_mode: PrivacyMode;
}

export const DEFAULT_POLICY: ModelPolicy = {
    default_model: '',
    module_overrides: {},
    user_allowlist: [],
    privacy_mode: 'all',
};

/** Defensive parse of an untrusted policy payload (gateway or test double). */
export function sanitizeModelPolicy(raw: unknown): ModelPolicy {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_POLICY };
    const rec = raw as Record<string, unknown>;
    const policy: ModelPolicy = { ...DEFAULT_POLICY };
    if (typeof rec.default_model === 'string') policy.default_model = rec.default_model;
    if (
        rec.module_overrides &&
        typeof rec.module_overrides === 'object' &&
        !Array.isArray(rec.module_overrides)
    ) {
        const src = rec.module_overrides as Record<string, unknown>;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(src)) {
            if (typeof k === 'string' && k && typeof v === 'string') out[k] = v;
        }
        policy.module_overrides = out;
    }
    if (Array.isArray(rec.user_allowlist)) {
        policy.user_allowlist = rec.user_allowlist.filter(
            (m): m is string => typeof m === 'string' && m.length > 0
        );
    }
    if (rec.privacy_mode === 'local_only') policy.privacy_mode = 'local_only';
    return policy;
}

export interface ResolveQuery {
    policy: ModelPolicy;
    /** Manifest id; '' = shell-level consumer (shell chat). */
    moduleId: string;
    /** User's personal pick (fusion.shell.model); '' = unset. */
    userPref: string;
    /** Catalog snapshot; lets privacy mode verify locality of a candidate. */
    catalog?: ShellModel[];
}

/** Cloud models are forbidden under local_only; unknown models pass (no evidence). */
function passesPrivacy(model: string, policy: ModelPolicy, catalog?: ShellModel[]): boolean {
    if (policy.privacy_mode !== 'local_only' || !catalog) return true;
    const entry = catalog.find((m) => m.id === model);
    return !entry || entry.ownedBy !== 'cloud';
}

/** Effective model for one consumer, following the approved chain (#114). */
export function resolveModel(q: ResolveQuery): string {
    const override = q.policy.module_overrides[q.moduleId];
    if (override && passesPrivacy(override, q.policy, q.catalog)) return override;
    const pref = q.userPref;
    if (
        pref &&
        (q.policy.user_allowlist.length === 0 || q.policy.user_allowlist.includes(pref)) &&
        passesPrivacy(pref, q.policy, q.catalog)
    ) {
        return pref;
    }
    if (q.policy.default_model && passesPrivacy(q.policy.default_model, q.policy, q.catalog)) {
        return q.policy.default_model;
    }
    return '';
}

/** Picker filter (#114 AC): allowlist constrains, local_only hides cloud. */
export function pickerFilter(models: ShellModel[], policy: ModelPolicy): ShellModel[] {
    let out = models;
    if (policy.user_allowlist.length > 0) {
        const set = new Set(policy.user_allowlist);
        out = out.filter((m) => set.has(m.id));
    }
    if (policy.privacy_mode === 'local_only') {
        out = out.filter((m) => m.ownedBy !== 'cloud');
    }
    return out;
}
