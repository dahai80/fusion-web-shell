import { describe, expect, it } from 'bun:test';
import { parseDeliveryGates, parseDemandDrafts } from '../lib/coworkInbox';

/**
 * Factory approval card contracts (issue #183), pinned to cowork#597/#603
 * live shapes: /api/demand/leads (rows) and /api/delivery/orders (orders).
 */

describe('parseDemandDrafts (issue #183)', () => {
    it('keeps approved leads only, normalizing the row shape', () => {
        const cards = parseDemandDrafts({
            leads: [
                {
                    id: 7,
                    status: 'approved',
                    title: 'Upwork: dashboard build',
                    source: 'upwork',
                    draft_final: 'Hello, we can start Monday.',
                    arrived_at: 1795550000.5,
                },
                { id: 8, status: 'drafted', title: 'not approved yet' },
                { id: '9' as never, status: 'approved', title: 'no numeric id skipped' },
                { id: 10, status: 'won', title: 'already won' },
            ],
            count: 4,
        });
        expect(cards).toHaveLength(1);
        expect(cards[0]).toEqual({
            leadId: 7,
            title: 'Upwork: dashboard build',
            source: 'upwork',
            draftFinal: 'Hello, we can start Monday.',
            arrivedAt: 1795550000.5,
        });
    });

    it('degrades missing/invalid payloads to empty', () => {
        expect(parseDemandDrafts(undefined)).toEqual([]);
        expect(parseDemandDrafts({})).toEqual([]);
        expect(parseDemandDrafts({ leads: 'nope' })).toEqual([]);
    });

    it('fills missing strings with empty defaults', () => {
        const cards = parseDemandDrafts({ leads: [{ id: 3, status: 'approved' }] });
        expect(cards[0]).toEqual({
            leadId: 3,
            title: '',
            source: '',
            draftFinal: '',
            arrivedAt: 0,
        });
    });
});

describe('parseDeliveryGates (issue #183)', () => {
    it('keeps only orders parked on sow_gate / tad_gate', () => {
        const cards = parseDeliveryGates({
            orders: [
                {
                    order_no: 'ORD-2026-001',
                    title: 'Dashboard MVP',
                    capability: 'web-app',
                    stage: 'sow_gate',
                    price_cny: 99000,
                },
                {
                    order_no: 'ORD-2026-002',
                    stage: 'tad_gate',
                    title: '',
                    capability: '',
                    price_cny: 0,
                },
                { order_no: 'ORD-2026-003', stage: 'created' },
                { order_no: 'ORD-2026-004', stage: 'closed' },
                { order_no: '', stage: 'sow_gate' },
                { stage: 'sow_gate' },
            ],
            count: 6,
        });
        expect(cards).toHaveLength(2);
        expect(cards[0]).toEqual({
            orderNo: 'ORD-2026-001',
            title: 'Dashboard MVP',
            capability: 'web-app',
            stage: 'sow_gate',
            priceCny: 99000,
        });
        expect(cards[1]!.stage).toBe('tad_gate');
        expect(cards[1]!.priceCny).toBe(0);
    });

    it('degrades missing/invalid payloads to empty', () => {
        expect(parseDeliveryGates(undefined)).toEqual([]);
        expect(parseDeliveryGates(null)).toEqual([]);
        expect(parseDeliveryGates({ orders: null })).toEqual([]);
    });
});
