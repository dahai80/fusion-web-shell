import { describe, expect, it } from 'bun:test';
import { safeReturnPath } from '@/lib/returnPath';

// #451: the gateway's /login?return=<path> bounce target must be a
// same-origin root-relative path before the shell navigates to it.
describe('safeReturnPath', () => {
    it('accepts a root-relative module path', () => {
        expect(safeReturnPath('?return=%2Fshell%2Ffusion-cowork%2F')).toBe('/shell/fusion-cowork/');
    });

    it('accepts a path with its own query string', () => {
        expect(safeReturnPath('?return=%2Fshell%2Ffusion-cowork%2F%3Ftab%3D1')).toBe(
            '/shell/fusion-cowork/?tab=1'
        );
    });

    it('rejects a protocol-relative host', () => {
        expect(safeReturnPath('?return=%2F%2Fevil.example%2Fsteal')).toBeNull();
    });

    it('rejects an absolute URL', () => {
        expect(safeReturnPath('?return=https%3A%2F%2Fevil.example%2F')).toBeNull();
    });

    it('rejects a bare fragment or garbage', () => {
        expect(safeReturnPath('?return=javascript%3Aalert(1)')).toBeNull();
        expect(safeReturnPath('?return=x')).toBeNull();
    });

    it('rejects a missing parameter', () => {
        expect(safeReturnPath('')).toBeNull();
        expect(safeReturnPath('?other=1')).toBeNull();
    });
});
