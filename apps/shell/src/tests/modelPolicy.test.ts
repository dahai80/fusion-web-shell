import { describe, expect, it } from 'bun:test';
import type { ShellModel } from '../lib/modelCatalog';
import {
    DEFAULT_POLICY,
    type ModelPolicy,
    pickerFilter,
    resolveModel,
    sanitizeModelPolicy,
} from '../lib/modelPolicy';

const m = (id: string, ownedBy = 'local'): ShellModel => ({
    id,
    ownedBy,
    loaded: ownedBy === 'local',
    engineType: ownedBy === 'local' ? 'text' : '',
});

const CATALOG: ShellModel[] = [m('qwen-local'), m('glm-5', 'cloud'), m('claude-x', 'cloud')];

describe('sanitizeModelPolicy (#114)', () => {
    it('keeps valid fields and drops malformed ones', () => {
        const p = sanitizeModelPolicy({
            default_model: 'glm-5',
            module_overrides: { 'fusion-cowork': 'qwen-local', bad: 42, '': 'x' },
            user_allowlist: ['glm-5', '', 7],
            privacy_mode: 'local_only',
        });
        expect(p).toEqual({
            default_model: 'glm-5',
            module_overrides: { 'fusion-cowork': 'qwen-local' },
            user_allowlist: ['glm-5'],
            privacy_mode: 'local_only',
        });
    });
    it('falls back to defaults on garbage', () => {
        expect(sanitizeModelPolicy(null)).toEqual(DEFAULT_POLICY);
        expect(sanitizeModelPolicy([1])).toEqual(DEFAULT_POLICY);
        expect(sanitizeModelPolicy({ privacy_mode: 'nope' }).privacy_mode).toBe('all');
    });
});

describe('resolveModel chain (#114 AC: override > user pref > tenant default)', () => {
    const policy: ModelPolicy = {
        default_model: 'glm-5',
        module_overrides: { 'fusion-cowork': 'qwen-local' },
        user_allowlist: ['glm-5', 'qwen-local'],
        privacy_mode: 'all',
    };

    it('module override wins over user pref and tenant default', () => {
        expect(resolveModel({ policy, moduleId: 'fusion-cowork', userPref: 'glm-5' })).toBe(
            'qwen-local'
        );
    });
    it('user pref wins over tenant default for non-overridden modules', () => {
        expect(resolveModel({ policy, moduleId: 'fusion-doc', userPref: 'qwen-local' })).toBe(
            'qwen-local'
        );
    });
    it('tenant default applies when no user pref', () => {
        expect(resolveModel({ policy, moduleId: 'fusion-doc', userPref: '' })).toBe('glm-5');
    });
    it('user pref outside the allowlist is skipped', () => {
        const strict = { ...policy, user_allowlist: ['glm-5'] };
        expect(
            resolveModel({ policy: strict, moduleId: 'fusion-doc', userPref: 'qwen-local' })
        ).toBe('glm-5');
    });
    it('empty allowlist means unrestricted', () => {
        const open = { ...policy, user_allowlist: [] };
        expect(resolveModel({ policy: open, moduleId: 'fusion-doc', userPref: 'anything' })).toBe(
            'anything'
        );
    });
    it('falls back to empty (gateway routing default)', () => {
        expect(resolveModel({ policy: DEFAULT_POLICY, moduleId: 'x', userPref: '' })).toBe('');
    });
});

describe('privacy_mode=local_only (#114 AC)', () => {
    const policy: ModelPolicy = {
        default_model: 'glm-5',
        module_overrides: { 'fusion-cowork': 'claude-x' },
        user_allowlist: [],
        privacy_mode: 'local_only',
    };
    it('hides cloud models from the picker', () => {
        expect(pickerFilter(CATALOG, policy).map((x) => x.id)).toEqual(['qwen-local']);
    });
    it('skips cloud override and cloud tenant default in resolution', () => {
        expect(
            resolveModel({ policy, moduleId: 'fusion-cowork', userPref: '', catalog: CATALOG })
        ).toBe('');
        expect(
            resolveModel({ policy, moduleId: 'fusion-doc', userPref: 'glm-5', catalog: CATALOG })
        ).toBe('');
    });
    it('local models still resolve', () => {
        expect(
            resolveModel({
                policy,
                moduleId: 'fusion-doc',
                userPref: 'qwen-local',
                catalog: CATALOG,
            })
        ).toBe('qwen-local');
    });
    it('unknown models pass (no evidence of cloud)', () => {
        expect(
            resolveModel({ policy, moduleId: 'fusion-doc', userPref: 'obscure', catalog: CATALOG })
        ).toBe('obscure');
    });
});

describe('pickerFilter allowlist (#114 AC)', () => {
    it('restricts to allowlisted ids', () => {
        const policy: ModelPolicy = {
            ...DEFAULT_POLICY,
            user_allowlist: ['glm-5'],
        };
        expect(pickerFilter(CATALOG, policy).map((x) => x.id)).toEqual(['glm-5']);
    });
    it('unrestricted without allowlist', () => {
        expect(pickerFilter(CATALOG, DEFAULT_POLICY)).toHaveLength(3);
    });
});
