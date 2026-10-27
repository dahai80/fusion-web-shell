import './domSetup';
import { describe, expect, it } from 'bun:test';
import {
    ADMIN_PENDING_NOTE_EN,
    ADMIN_PENDING_NOTE_ZH,
    DEFAULT_ROLE_NAMES,
} from '../pages/AdminUsers';

// Wire contract with fusion-gateway internal/shell/roles.go (E6, gateway #275):
// the role fallback must only offer names the gateway actually knows, and the
// pending note must describe the real degradation cause (old gateway binary),
// not the long-shipped identity contract.
describe('admin users wire contract (gateway #275 / identity #12)', () => {
    it('role fallback lists exactly the gateway builtin roles', () => {
        expect(DEFAULT_ROLE_NAMES).toEqual(['admin', 'user', 'auditor']);
    });

    it('pending note no longer claims the surfaces are unshipped', () => {
        expect(ADMIN_PENDING_NOTE_ZH).not.toContain('fusion-identity');
        expect(ADMIN_PENDING_NOTE_EN).not.toContain('identity contract');
        expect(ADMIN_PENDING_NOTE_ZH).toContain('网关');
        expect(ADMIN_PENDING_NOTE_EN.toLowerCase()).toContain('gateway');
    });
});
