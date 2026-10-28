import './domSetup';
import { describe, expect, it } from 'bun:test';
import type { ManifestDto } from '../api/endpoints';
import { iframeAllowPolicy, useManifests } from '../stores/manifests';
import type { ModuleManifest } from '../types/manifest';

const VOICE_DTO: ManifestDto = {
    id: 'fusion-charactervoice',
    title: 'CharacterVoice',
    path: '/fusion-charactervoice',
    entry: '/shell/fusion-charactervoice/',
    devices: ['desktop'],
    category: 'domain',
    permissions_policy: ['microphone', 'camera', 'not-a-real-feature'],
};

describe('permissions_policy manifest field (issue #66)', () => {
    it('sanitizes to known feature tokens only, dropping junk', () => {
        useManifests.setState({ manifests: [], loaded: false });
        useManifests.getState().setUpstream([VOICE_DTO]);
        const m = useManifests.getState().manifests[0];
        expect(m?.permissions_policy).toEqual(['microphone', 'camera']);
    });

    // Issue #82: the gateway registry serves camelCase permissionsPolicy; the
    // store used to read only snake_case, silently dropping the iframe allow.
    it('accepts the gateway camelCase permissionsPolicy field (issue #82)', () => {
        useManifests.setState({ manifests: [], loaded: false });
        useManifests.getState().setUpstream([
            {
                ...VOICE_DTO,
                permissions_policy: undefined,
                permissionsPolicy: ['microphone', 'camera', 'not-a-real-feature'],
            },
        ]);
        const m = useManifests.getState().manifests[0];
        expect(m?.permissions_policy).toEqual(['microphone', 'camera']);
    });

    it('absent field leaves permissions_policy undefined (no behavior change)', () => {
        useManifests.setState({ manifests: [], loaded: false });
        useManifests.getState().setUpstream([
            {
                id: 'fusion-cowork',
                title: 'Cowork',
                path: '/fusion-cowork',
                entry: '/shell/fusion-cowork/',
                devices: ['desktop'],
                category: 'platform',
            },
        ]);
        expect(useManifests.getState().manifests[0]?.permissions_policy).toBeUndefined();
    });
});

describe('iframeAllowPolicy (issue #66)', () => {
    const base: ModuleManifest = {
        id: 'm',
        title: 'm',
        path: '/m',
        entry: '/shell/m/',
        devices: ['desktop'],
        category: 'domain',
    };

    it('undefined when the manifest declares nothing — iframe gets no allow attr', () => {
        expect(iframeAllowPolicy(base)).toBeUndefined();
        expect(iframeAllowPolicy({ ...base, permissions_policy: [] })).toBeUndefined();
    });

    it("delegates each declared feature scoped to the frame's own origin", () => {
        expect(iframeAllowPolicy({ ...base, permissions_policy: ['microphone'] })).toBe(
            "microphone 'src'"
        );
        expect(iframeAllowPolicy({ ...base, permissions_policy: ['microphone', 'camera'] })).toBe(
            "microphone 'src'; camera 'src'"
        );
    });

    // Issue #82: manifests may carry the gateway camelCase field — the allow
    // attribute must survive the field-name drift.
    it('reads camelCase permissionsPolicy too (issue #82)', () => {
        expect(
            iframeAllowPolicy({ ...base, permissionsPolicy: ['microphone'] } as ModuleManifest)
        ).toBe("microphone 'src'");
    });
});
