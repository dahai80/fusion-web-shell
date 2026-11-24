import { describe, expect, test } from 'bun:test';
import type { FactoryOrder } from '../lib/factoryApi';
import {
    type FactoryIssue,
    boardColumns,
    computeOpsMetrics,
    isIssueOverdue,
    isOrderErrored,
    issueAgeHours,
    parseFactoryIssues,
    stageFromFactoryOrder,
} from '../lib/factoryBoard';

type OrderPartial = Partial<FactoryOrder> & { lifecycle?: string };

function order(partial: OrderPartial): FactoryOrder {
    return {
        id: 'o1',
        flow_id: 'flow-1',
        order_id: 'c1',
        acceptance: '[]',
        price_cny: 100,
        price_usd: 14,
        currency: 'CNY',
        status: 'created',
        order_error: '',
        created_at: '2026-11-24T00:00:00Z',
        ...partial,
    };
}

describe('stageFromFactoryOrder', () => {
    test('maps lifecycle stages to the S0-S7 ladder', () => {
        const lifecycle = (l: string) =>
            stageFromFactoryOrder(order({ lifecycle: l, status: 'paid_mock' }));
        expect(lifecycle('intake')).toBe('S0');
        expect(lifecycle('prd')).toBe('S1');
        expect(lifecycle('prepay')).toBe('S2');
        expect(lifecycle('build')).toBe('S3');
        expect(lifecycle('qa')).toBe('S4');
        expect(lifecycle('accept')).toBe('S5');
        expect(lifecycle('deliver')).toBe('S6');
    });

    test('falls back to payment status when lifecycle is absent', () => {
        expect(stageFromFactoryOrder(order({ status: 'created' }))).toBe('S0');
        expect(stageFromFactoryOrder(order({ status: 'paid_mock' }))).toBe('S2');
        expect(stageFromFactoryOrder(order({ status: 'building' }))).toBe('S3');
        expect(stageFromFactoryOrder(order({ status: 'delivered' }))).toBe('S6');
        expect(stageFromFactoryOrder(order({ status: 'mystery' }))).toBeNull();
    });

    test('errored orders never map to a stage', () => {
        expect(isOrderErrored(order({ status: 'order_error', order_error: 'boom' }))).toBe(true);
        expect(isOrderErrored(order({ status: 'building', order_error: 'boom' }))).toBe(true);
        expect(
            stageFromFactoryOrder(order({ status: 'order_error', order_error: 'boom' }))
        ).toBeNull();
    });
});

describe('boardColumns', () => {
    test('buckets orders per stage and collects errored/unknown', () => {
        const cols = boardColumns([
            order({ id: 'a', lifecycle: 'intake' }),
            order({ id: 'b', lifecycle: 'build' }),
            order({ id: 'c', status: 'order_error', order_error: 'boom' }),
            order({ id: 'd', status: 'mystery' }),
        ]);
        expect(cols.S0?.map((o) => o.id)).toEqual(['a']);
        expect(cols.S3?.map((o) => o.id)).toEqual(['b']);
        expect(cols.errored.map((o) => o.id)).toEqual(['c']);
        expect(cols.unknown.map((o) => o.id)).toEqual(['d']);
    });
});

describe('issue SLA helpers', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
    const issue = (p: Partial<FactoryIssue>): FactoryIssue => ({
        id: 'i1',
        repo: 'owner/repo',
        issueNumber: 7,
        title: 'bug',
        orderId: null,
        status: 'in-progress',
        slaHours: 24,
        createdAt: hoursAgo(1),
        ...p,
    });

    test('parse drops rows without id and degrades unknown status to triaged', () => {
        const rows = parseFactoryIssues([
            { id: 'a', status: 'weird', sla_hours: 3 },
            { repo: 'no-id' },
            null,
            'junk',
        ]);
        expect(rows).toHaveLength(1);
        const first = rows[0]!;
        expect(first.status).toBe('triaged');
        expect(first.slaHours).toBe(3);
    });

    test('issueAgeHours measures elapsed time and survives invalid dates', () => {
        expect(issueAgeHours(issue({ createdAt: hoursAgo(2) }))).toBeGreaterThanOrEqual(1.9);
        expect(issueAgeHours(issue({ createdAt: 'not-a-date' }))).toBeNull();
    });

    test('overdue only for non-closed issues past their SLA budget', () => {
        expect(isIssueOverdue(issue({ createdAt: hoursAgo(25), slaHours: 24 }))).toBe(true);
        expect(isIssueOverdue(issue({ createdAt: hoursAgo(2), slaHours: 24 }))).toBe(false);
        expect(
            isIssueOverdue(issue({ createdAt: hoursAgo(48), slaHours: 24, status: 'closed' }))
        ).toBe(false);
        expect(isIssueOverdue(issue({ createdAt: hoursAgo(48), slaHours: null }))).toBe(false);
    });
});

describe('computeOpsMetrics', () => {
    test('win/error rates from order records only; missing sources stay null', () => {
        const m = computeOpsMetrics([
            order({ id: 'a', status: 'delivered' }),
            order({ id: 'b', status: 'building' }),
            order({ id: 'c', status: 'order_error', order_error: 'boom' }),
        ]);
        expect(m.total).toBe(3);
        expect(m.winRate).toBeCloseTo(1 / 2);
        expect(m.errorRate).toBeCloseTo(1 / 3);
        expect(m.avgDeliveryHours).toBeNull();
        expect(m.reworkRate).toBeNull();
    });

    test('empty list yields null rates, not NaN', () => {
        const m = computeOpsMetrics([]);
        expect(m.total).toBe(0);
        expect(m.winRate).toBeNull();
        expect(m.errorRate).toBeNull();
    });
});
