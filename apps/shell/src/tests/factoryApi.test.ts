import { describe, expect, it } from 'bun:test';
import { LIFECYCLE_LABEL } from '../lib/agentsApi';
import {
    type FactoryOrder,
    LIFECYCLE_CHIP,
    acceptanceItems,
    lifecycleFromFactoryOrder,
    splitOrderQueues,
} from '../lib/factoryApi';

/**
 * Factory operator data layer contracts (issue #179), pinned against the
 * live fusion-site routes (read via the gateway shell proxy on :11432):
 *   GET /shell/fusion-site/api/factory/order -> { orders: [...] }
 * with factory_orders rows carrying the payment-flow status enum
 * created | paid_mock | building | delivered | order_error.
 */

const order = (over: Partial<FactoryOrder>): FactoryOrder => ({
    id: 'ord-1',
    flow_id: 'flow-abcdef123456',
    order_id: 'co-77',
    acceptance: '["login works","export to CSV"]',
    price_cny: 99000,
    price_usd: 13900,
    currency: 'cny',
    status: 'created',
    order_error: '',
    created_at: '2026-11-20 10:00:00',
    ...over,
});

describe('lifecycleFromFactoryOrder (issue #179 / #177 R2 enum)', () => {
    it('mirrors the fusion-site orderRunStatus mapping', () => {
        expect(lifecycleFromFactoryOrder('created')).toBe('queued');
        expect(lifecycleFromFactoryOrder('paid_mock')).toBe('awaiting_human');
        expect(lifecycleFromFactoryOrder('building')).toBe('running');
        expect(lifecycleFromFactoryOrder('delivered')).toBe('done');
        expect(lifecycleFromFactoryOrder('order_error')).toBe('error');
    });

    it('maps unknown statuses to blocked, never a healthy state', () => {
        expect(lifecycleFromFactoryOrder('mystery')).toBe('blocked');
        expect(lifecycleFromFactoryOrder('')).toBe('blocked');
    });

    it('stays inside the unified lifecycle vocabulary', () => {
        for (const status of [
            'created',
            'paid_mock',
            'building',
            'delivered',
            'order_error',
            'x',
        ]) {
            expect(LIFECYCLE_LABEL[lifecycleFromFactoryOrder(status)]).toBeDefined();
            expect(LIFECYCLE_CHIP[lifecycleFromFactoryOrder(status)].cls).toContain('bg-');
        }
    });
});

describe('splitOrderQueues (issue #179 operator queues)', () => {
    it('splits customer-owed / operator-owed / in-flight', () => {
        const q = splitOrderQueues([
            order({ id: 'a', status: 'created' }),
            order({ id: 'b', status: 'paid_mock' }),
            order({ id: 'c', status: 'delivered' }),
            order({ id: 'd', status: 'order_error' }),
            order({ id: 'e', status: 'building' }),
        ]);
        expect(q.customerOwed.map((o) => o.id)).toEqual(['a']);
        expect(q.operatorOwed.map((o) => o.id)).toEqual(['b']);
        expect(q.inFlight.map((o) => o.id)).toEqual(['c', 'd', 'e']);
    });

    it('handles an empty ledger', () => {
        const q = splitOrderQueues([]);
        expect(q.customerOwed).toHaveLength(0);
        expect(q.operatorOwed).toHaveLength(0);
        expect(q.inFlight).toHaveLength(0);
    });
});

describe('acceptanceItems', () => {
    it('parses the acceptance JSON column', () => {
        expect(acceptanceItems(order({}))).toEqual(['login works', 'export to CSV']);
    });

    it('degrades corrupt / non-list payloads to empty', () => {
        expect(acceptanceItems(order({ acceptance: 'not json' }))).toEqual([]);
        expect(acceptanceItems(order({ acceptance: '{"a":1}' }))).toEqual([]);
        expect(acceptanceItems(order({ acceptance: '[1,2]' }))).toEqual([]);
    });
});
