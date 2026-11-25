import { describe, expect, it } from 'bun:test';
import {
    OFFICE_ROUTE_TYPE,
    type OfficeRun,
    parseOfficeArtifacts,
    parseOfficeDevices,
    parseOfficeRuns,
} from './officeCenter';

// Issue #191 (office command center): all zone data is parsed defensively —
// upstream payloads are untrusted (gateway-proxied module APIs), and every
// surface must degrade to an empty list instead of throwing.

describe('office command center parsers (#191)', () => {
    it('parseOfficeRuns keeps rows with a run_id, drops the rest, sorts newest first', () => {
        const runs = parseOfficeRuns({
            runs: [
                { run_id: 'run_b', workflow_name: 'later', status: 'running', created_at: 200 },
                { workflow_name: 'no id', status: 'success' },
                {
                    run_id: 'run_a',
                    workflow_name: 'earlier',
                    status: 'success',
                    created_at: 100,
                    error: 'x',
                },
                { run_id: 'run_c', status: 42, created_at: 'bad' },
            ],
            count: 4,
        });
        expect(runs.map((r: OfficeRun) => r.runId)).toEqual(['run_b', 'run_a', 'run_c']);
        expect(runs[1]!.name).toBe('earlier');
        expect(runs[1]!.error).toBe('x');
        expect(runs[2]!.status).toBe('unknown');
        expect(runs[2]!.createdAt).toBeNull();
    });

    it('parseOfficeRuns returns empty for junk payloads', () => {
        expect(parseOfficeRuns(null)).toEqual([]);
        expect(parseOfficeRuns({ runs: 'nope' })).toEqual([]);
        expect(parseOfficeRuns(undefined)).toEqual([]);
    });

    it('parseOfficeArtifacts normalizes kind/version, falls back name to id', () => {
        const items = parseOfficeArtifacts({
            artifacts: [
                { id: 'art_1', name: 'Deck', kind: 'document', current_version: 3 },
                { id: 'art_2', kind: 7 },
                { name: 'no id' },
            ],
        });
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ id: 'art_1', name: 'Deck', kind: 'document', version: 3 });
        expect(items[1]).toEqual({ id: 'art_2', name: 'art_2', kind: '', version: 1 });
    });

    it('parseOfficeDevices keeps rows with a device_id, coerces flags', () => {
        const devices = parseOfficeDevices({
            devices: [
                { device_id: 'dev_a', online: true, is_default_execution: true },
                { device_id: 'dev_b', online: 'yes' },
                { online: true },
                'junk',
            ],
        });
        expect(devices).toEqual([
            { deviceId: 'dev_a', online: true, isDefault: true },
            { deviceId: 'dev_b', online: false, isDefault: false },
        ]);
        expect(parseOfficeDevices(null)).toEqual([]);
        expect(parseOfficeDevices({ devices: 5 })).toEqual([]);
    });

    it('route → broker type mapping covers every selector route', () => {
        for (const route of ['documents', 'sheets', 'slides'] as const) {
            expect(typeof OFFICE_ROUTE_TYPE[route]).toBe('string');
        }
        expect(OFFICE_ROUTE_TYPE.sheets).toBe('analyze');
    });
});
