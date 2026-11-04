import {
    fetchModelPolicy,
    fetchModelPreference,
    isGatewayPending,
    putModelPolicy,
} from '@/api/endpoints';
import { type ModelPolicy, resolveModel, sanitizeModelPolicy } from '@/lib/modelPolicy';
import { usePrefs } from '@/stores/prefs';
import { create } from 'zustand';

/**
 * Model-policy store (issue #114). Tenant-scoped policy lives in the gateway
 * (fusion-gateway#486); until that ships, GET/PUT 404 and the store pins
 * gatewayPending — Settings degrades to a notice, resolution falls back to
 * the user preference layer only. A successful save fires the shell-level
 * `fusion:model-policy` event so host bridges push the new policy into
 * module iframes (SDK cache invalidation).
 */

export const MODEL_POLICY_EVENT = 'fusion:model-policy';

/** Neutral fallback used while the gateway API is pending. */
const FALLBACK_POLICY: ModelPolicy = {
    default_model: '',
    module_overrides: {},
    user_allowlist: [],
    privacy_mode: 'all',
};

interface ModelPolicyState {
    policy: ModelPolicy;
    loaded: boolean;
    /** Gateway has no model-policy API yet (404) — honest degradation. */
    gatewayPending: boolean;
    error: string | null;
    load(force?: boolean): Promise<void>;
    save(next: ModelPolicy): Promise<void>;
    /**
     * Effective model for one consumer: gateway preference endpoint first
     * (host token, server-side chain), local chain fallback while pending.
     */
    effective(moduleId: string): Promise<string>;
    /**
     * Synchronous local-chain read from store state (no fetch): hot paths
     * like the chat poster must not suspend before their abort wiring runs.
     */
    effectiveSync(moduleId: string): string;
}

export const useModelPolicy = create<ModelPolicyState>((set, get) => ({
    policy: { ...FALLBACK_POLICY },
    loaded: false,
    gatewayPending: false,
    error: null,

    async load(force) {
        if (get().loaded && !force) return;
        try {
            const raw = await fetchModelPolicy();
            const policy = sanitizeModelPolicy(raw);
            set({ policy, loaded: true, gatewayPending: false, error: null });
            console.log('[model-policy] loaded, default:', policy.default_model || '(none)');
        } catch (err) {
            if (isGatewayPending(err)) {
                console.warn('[model-policy] gateway API not shipped yet (fusion-gateway#486)');
                set({ gatewayPending: true, loaded: true, error: null });
                return;
            }
            console.error('[model-policy] load failed', err);
            set({ error: (err as Error).message });
        }
    },

    async save(next) {
        await putModelPolicy(next);
        set({ policy: sanitizeModelPolicy(next), loaded: true, gatewayPending: false });
        window.dispatchEvent(new CustomEvent(MODEL_POLICY_EVENT, { detail: next }));
        console.log('[model-policy] saved, default:', next.default_model || '(none)');
    },

    async effective(moduleId) {
        const { gatewayPending, loaded, load, policy } = get();
        if (!loaded) await load();
        if (!gatewayPending) {
            try {
                const model = await fetchModelPreference(moduleId);
                if (model) return model;
            } catch (err) {
                console.warn('[model-policy] preference endpoint failed, local fallback', err);
            }
        }
        return resolveModel({
            policy: get().gatewayPending ? FALLBACK_POLICY : policy,
            moduleId,
            userPref: usePrefs.getState().model,
        });
    },

    effectiveSync(moduleId) {
        const { gatewayPending, loaded, policy } = get();
        return resolveModel({
            policy: loaded && !gatewayPending ? policy : FALLBACK_POLICY,
            moduleId,
            userPref: usePrefs.getState().model,
        });
    },
}));
