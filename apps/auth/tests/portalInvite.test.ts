import { describe, expect, it } from 'bun:test';
import { inviteRedeemUrl, readInviteToken } from '../src/api';

// Issue #184 (shell-side invite handoff): email links land on
// /auth/?invite=<token>; the portal validates the token shape and hands the
// customer off to the fusion-site activation page, whose BFF consumes the
// single-use cowork invite (cowork #609) and registers the identity account
// with tenant binding (upstream #150). The portal runs no redemption of its
// own — a parallel contract with no server would be a lie.
describe('portal invite handoff (#184)', () => {
    it('readInviteToken accepts sane tokens and rejects junk', () => {
        expect(readInviteToken('?invite=abc_DEF-123&return=%2F')).toBe('abc_DEF-123');
        expect(readInviteToken('?invite=')).toBeNull();
        expect(readInviteToken('?invite=has%20space')).toBeNull();
        expect(readInviteToken(`?invite=${'x'.repeat(129)}`)).toBeNull();
        expect(readInviteToken('?return=%2F')).toBeNull();
    });

    it('inviteRedeemUrl points at the fusion-site activation page, token encoded', () => {
        expect(inviteRedeemUrl('abc_DEF-123')).toBe('/shell/fusion-site/invite/abc_DEF-123');
        expect(inviteRedeemUrl('a/b?c')).toBe('/shell/fusion-site/invite/a%2Fb%3Fc');
    });
});
