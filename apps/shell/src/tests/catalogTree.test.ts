import { describe, expect, it } from 'bun:test';
import {
    type CatalogEntry,
    catalogRows,
    groupedCatalogRows,
    installCommand,
    sanitizeCatalog,
} from '../lib/catalogTree';
import type { ModuleManifest } from '../types/manifest';

const entry = (id: string, category = 'domain'): CatalogEntry => ({
    id,
    title: id,
    category,
    dependencies: [],
});

const manifest = (id: string): ModuleManifest => ({
    id,
    title: id,
    path: `/shell/${id}`,
    entry: `/shell/${id}/`,
    devices: ['desktop'],
    category: 'domain',
});

describe('sanitizeCatalog (#116)', () => {
    it('keeps valid entries and drops malformed ones', () => {
        const rows = sanitizeCatalog({
            items: [
                { id: 'fusion-cowork', title: 'Cowork', dependencies: ['mlx', '', 3] },
                { id: '', title: 'no id' },
                { id: 'x' },
                'garbage',
                null,
            ],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: 'fusion-cowork', dependencies: ['mlx'] });
    });
    it('accepts bare arrays and drops garbage shapes', () => {
        expect(sanitizeCatalog([{ id: 'a', title: 'A' }])).toHaveLength(1);
        expect(sanitizeCatalog(null)).toEqual([]);
        expect(sanitizeCatalog({ items: 'nope' })).toEqual([]);
    });
});

describe('catalogRows three states (#116 AC)', () => {
    it('running / stopped / not_installed from registry + health', () => {
        const entries = [entry('fusion-cowork'), entry('fusion-drama'), entry('fusion-office')];
        const manifests = [manifest('fusion-cowork'), manifest('fusion-drama')];
        const rows = catalogRows(entries, manifests, new Set(['fusion-drama']));
        expect(rows.map((r) => r.state)).toEqual(['running', 'stopped', 'not_installed']);
        expect(rows[2]?.manifest).toBeUndefined();
    });
});

describe('groupedCatalogRows (#116 AC: not-installed inside their group, sorted after installed)', () => {
    it('buckets not-installed entries by section, installed never duplicated', () => {
        const entries = [
            entry('fusion-office'),
            entry('fusion-drama'),
            entry('fusion-doc', 'platform'),
        ];
        const rows = catalogRows(entries, [manifest('fusion-drama')], new Set([]));
        const groups = groupedCatalogRows(rows, (id) =>
            id === 'fusion-doc' ? 'platform' : 'domain'
        );
        expect(groups.map((g) => g.section)).toEqual(['domain', 'platform']);
        expect(groups[0]?.notInstalled.map((r) => r.entry.id)).toEqual(['fusion-office']);
        expect(groups[1]?.notInstalled.map((r) => r.entry.id)).toEqual(['fusion-doc']);
    });
});

describe('installCommand (#116)', () => {
    it('composes the fusion install handoff', () => {
        expect(installCommand(entry('fusion-office'))).toBe('fusion install fusion-office');
    });
});
