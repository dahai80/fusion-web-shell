import { describe, expect, it } from 'bun:test';
import {
    AUDIT_CLASSES,
    SYNC_EXAMPLE,
    auditQueryString,
    collectMenuMatrix,
    effectiveMenus,
    formatAdminError,
    parseJsonInput,
    sanitizeAdapters,
    sanitizeAudit,
    sanitizeConnectors,
    sanitizeRoles,
    stripAuditPathPrefix,
} from '../lib/settingsOps';

describe('settingsOps sanitizers (issue #42, migration E6)', () => {
    it('sanitizes adapter rows: masks kept, non-numeric rate/jitter defaulted', () => {
        const rows = sanitizeAdapters({
            adapters: [
                {
                    platform: 'shopify',
                    configured: true,
                    enabled: true,
                    credentials_masked: { access_token: '…ab12' },
                    rate_limit_rps: 2,
                    jitter_ms: 200,
                },
                { platform: '', rate_limit_rps: 'x' },
                null,
                { platform: 'amazon', configured: 'yes', credentials_masked: 'junk' },
            ],
        });
        expect(rows).toEqual([
            {
                platform: 'shopify',
                configured: true,
                enabled: true,
                credentials_masked: { access_token: '…ab12' },
                rate_limit_rps: 2,
                jitter_ms: 200,
            },
            {
                platform: 'amazon',
                configured: false,
                enabled: false,
                credentials_masked: {},
                rate_limit_rps: 0,
                jitter_ms: 0,
            },
        ]);
        expect(sanitizeAdapters(null)).toEqual([]);
        expect(sanitizeAdapters({ adapters: 'junk' })).toEqual([]);
    });

    it('sanitizes connector rows: operations and problems are string lists', () => {
        const rows = sanitizeConnectors({
            connectors: [
                {
                    id: 'aws-catalog-sync',
                    kind: 'rest',
                    operations: ['product.list', 'product.create'],
                    problems: [],
                },
                { id: 'broken', operations: [1, 'ok'], problems: ['missing base_url'] },
                { nope: true },
            ],
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]!.operations).toEqual(['product.list', 'product.create']);
        expect(rows[1]!.operations).toEqual(['ok']);
        expect(rows[1]!.problems).toEqual(['missing base_url']);
        expect(sanitizeConnectors({})).toEqual([]);
    });

    it('sanitizes audit entries: integrity defaults false, outcome defaults error', () => {
        const rows = sanitizeAudit({
            entries: [
                {
                    ts: 1761060000,
                    user: 'op1',
                    role: 'operator',
                    action_class: 'write',
                    method: 'PUT',
                    path: '/api/ecommerce/config/x',
                    outcome: 'ok',
                    duration_ms: 12,
                    integrity_ok: true,
                },
                { ts: 'bad', user: 'u2', outcome: 'denied' },
            ],
        });
        expect(rows[0]).toEqual({
            ts: 1761060000,
            user: 'op1',
            role: 'operator',
            action_class: 'write',
            method: 'PUT',
            path: '/api/ecommerce/config/x',
            outcome: 'ok',
            duration_ms: 12,
            integrity_ok: true,
        });
        expect(rows[1]!.integrity_ok).toBe(false);
        expect(rows[1]!.outcome).toBe('denied');
        expect(rows[1]!.action_class).toBe('');
        expect(sanitizeAudit({ entries: null })).toEqual([]);
    });

    it('sanitizes role lists with the write-class vocabulary', () => {
        const { roles, writeClasses } = sanitizeRoles({
            roles: [
                {
                    name: 'admin',
                    builtin: true,
                    write_classes: [],
                    description: '',
                    user_count: 1,
                },
                {
                    name: 'merch',
                    builtin: false,
                    write_classes: ['inventory'],
                    description: 'Merchandising',
                    user_count: 3,
                },
                { name: '' },
            ],
            write_classes: ['inventory', 'pricing'],
        });
        expect(roles).toHaveLength(2);
        expect(roles[1]!.builtin).toBe(false);
        expect(writeClasses).toEqual(['inventory', 'pricing']);
        expect(sanitizeRoles(null)).toEqual({ roles: [], writeClasses: [] });
    });

    it('audit class vocabulary matches the f-ecommerce filter', () => {
        expect(AUDIT_CLASSES).toEqual(['read', 'write', 'approval', 'agent_run', 'config', 'auth']);
    });
});

describe('menu permissions matrix (issue #42)', () => {
    const menus = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            href: 'dashboard.html',
            roles: ['admin', 'operator'],
        },
        { id: 'reports', label: 'Reports', href: 'reports.html', roles: ['admin'] },
    ];

    it('collects the grid state as source of truth (add and remove roles)', () => {
        const on = new Set(['admin:0', 'operator:0', 'admin:1', 'auditor:1']);
        const doc = collectMenuMatrix(menus, ['admin', 'operator', 'auditor'], (role, i) =>
            on.has(`${role}:${i}`)
        );
        expect(doc.menus[0]!.roles).toEqual(['admin', 'operator']);
        expect(doc.menus[1]!.roles).toEqual(['admin', 'auditor']);
    });

    it('effectiveMenus prefers non-empty overrides and falls back to defaults', () => {
        const defaults = { menus };
        expect(
            effectiveMenus({
                defaults,
                overrides: { menus: [{ id: 'x', label: 'X', href: 'x.html', roles: ['admin'] }] },
            }).menus[0]!.id
        ).toBe('x');
        expect(effectiveMenus({ defaults, overrides: {} }).menus).toHaveLength(2);
        expect(effectiveMenus({ defaults, overrides: { menus: [] } }).menus).toHaveLength(2);
        expect(effectiveMenus(null)).toEqual({ menus: [] });
        expect(
            effectiveMenus({ defaults: { menus: [{ id: '', label: 'L', href: '', roles: [] }] } })
                .menus
        ).toHaveLength(0);
    });
});

describe('audit filter + json input (issue #42)', () => {
    it('builds the audit query string with encoding', () => {
        expect(auditQueryString('', '')).toBe('');
        expect(auditQueryString('op1', '')).toBe('?user=op1');
        expect(auditQueryString('', 'agent_run')).toBe('?action_class=agent_run');
        expect(auditQueryString('user two', 'auth')).toBe('?user=user+two&action_class=auth');
    });

    it('parses textarea JSON with a clean error on invalid input', () => {
        expect(parseJsonInput('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
        expect(parseJsonInput('')).toEqual({ ok: true, value: {} });
        const bad = parseJsonInput('{nope');
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.error.length).toBeGreaterThan(0);
    });

    it('ships the connector sync example as valid JSON with operations', () => {
        const parsed = parseJsonInput(JSON.stringify(SYNC_EXAMPLE));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            const doc = parsed.value as typeof SYNC_EXAMPLE;
            expect(Object.keys(doc.operations).length).toBeGreaterThan(0);
            expect(doc.credential_ref).toBe('aws-catalog-sync');
        }
    });
});

describe('E6 parity followup (issue #42 incomplete fix)', () => {
    it('parseJsonInput rejects empty input when requireNonEmpty is set', () => {
        expect(parseJsonInput('{"a":1}', { requireNonEmpty: true })).toEqual({
            ok: true,
            value: { a: 1 },
        });
        const empty = parseJsonInput('', { requireNonEmpty: true });
        expect(empty.ok).toBe(false);
        const blank = parseJsonInput('   ', { requireNonEmpty: true });
        expect(blank.ok).toBe(false);
        // default behavior unchanged: empty falls back to {}
        expect(parseJsonInput('')).toEqual({ ok: true, value: {} });
    });

    it('formatAdminError surfaces envelope detail, including reassigned-user lists', () => {
        const strDetail = Object.assign(new Error('HTTP 400'), {
            envelope: { message: 'save failed', detail: 'name already taken' },
        });
        expect(formatAdminError(strDetail)).toBe('name already taken');
        const objDetail = Object.assign(new Error('HTTP 409'), {
            envelope: {
                message: 'role in use',
                detail: { reason: 'role still has users', users: ['op1', 'op2'] },
            },
        });
        expect(formatAdminError(objDetail)).toBe('role still has users: op1, op2');
        const problems = Object.assign(new Error('HTTP 400'), {
            envelope: { message: 'invalid connector', problems: ['missing base_url', 'bad op'] },
        });
        expect(formatAdminError(problems)).toBe('missing base_url; bad op');
        expect(formatAdminError(new Error('plain failure'))).toBe('plain failure');
        expect(formatAdminError(null)).toBe('');
    });

    it('stripAuditPathPrefix shortens shell paths for display', () => {
        expect(stripAuditPathPrefix('/api/v1/shell/config/pricing')).toBe('/config/pricing');
        expect(stripAuditPathPrefix('/api/v1/other/thing')).toBe('/api/v1/other/thing');
        expect(stripAuditPathPrefix('/config/x')).toBe('/config/x');
        expect(stripAuditPathPrefix('')).toBe('');
    });
});
