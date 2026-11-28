import { describe, expect, test } from 'bun:test';
import {
    computeConsoleMetrics,
    draftArms,
    parseCatalogPrice,
    parseDeliveryOrder,
    parseOpsLead,
    privacyRouting,
} from './opsConsole';

describe('parseOpsLead', () => {
    test('maps snake_case engine row to the view model', () => {
        const lead = parseOpsLead({
            id: 7,
            source: 'direct',
            title: 'RAG bot',
            description: 'build a kb',
            status: 'drafted',
            budget_hint: '3k',
            match_score: 4.5,
            match_reason: 'kw: rag',
            matched_capabilities: ['rag-qa'],
            arrived_at: 1700000000,
            draft_a: 'local draft text',
            draft_b: 'cloud draft text',
            draft_meta: {
                model_a: 'mlx-community/Qwen3-27B',
                model_b: 'glm-5',
                latency_a: 12.4,
                latency_b: 8.1,
                errors: [],
            },
            draft_pick: '',
            draft_final: '',
            draft_edit_distance: -1,
        });
        expect(lead).not.toBeNull();
        expect(lead?.status).toBe('drafted');
        expect(lead?.draftMeta.modelA).toBe('mlx-community/Qwen3-27B');
        expect(lead?.draftMeta.latencyB).toBe(8.1);
        expect(lead?.matchedCapabilities).toEqual(['rag-qa']);
        expect(lead?.editDistance).toBe(-1);
    });

    test('drops junk rows and coerces bad meta', () => {
        expect(parseOpsLead(null)).toBeNull();
        expect(parseOpsLead({ title: 'no id' })).toBeNull();
        const lead = parseOpsLead({ id: 1, draft_meta: 'garbage', matched_capabilities: 'x' });
        expect(lead?.draftMeta.modelA).toBe('');
        expect(lead?.draftMeta.errors).toEqual([]);
        expect(lead?.matchedCapabilities).toEqual([]);
    });
});

describe('computeConsoleMetrics', () => {
    const lead = (status: string) => parseOpsLead({ id: 1, status })!;
    test('counts real statuses only', () => {
        const m = computeConsoleMetrics(
            [
                lead('normalized'),
                lead('parked'),
                lead('matched'),
                lead('drafted'),
                lead('discarded'),
            ],
            [],
            new Date('2026-11-28T00:00:00Z').getTime()
        );
        expect(m.newLeads).toBe(2);
        expect(m.pendingDraft).toBe(1);
        expect(m.quoted).toBe(1);
        expect(m.inDelivery).toBe(0);
        expect(m.monthlyRevenueCny).toBe(0);
    });

    test('revenue sums only this month delivery orders', () => {
        const o = (no: string, price: number, created: number, stage = 'created') =>
            parseDeliveryOrder({ order_no: no, price_cny: price, created_at: created, stage })!;
        const now = new Date('2026-11-28T12:00:00Z').getTime();
        const m = computeConsoleMetrics(
            [],
            [
                o('D1', 2000, new Date('2026-11-10T00:00:00Z').getTime() / 1000, 's2'),
                o('D2', 500, new Date('2026-10-30T00:00:00Z').getTime() / 1000),
                o('D3', 100, now / 1000),
            ],
            now
        );
        expect(m.monthlyRevenueCny).toBe(2100);
        expect(m.inDelivery).toBe(1);
    });
});

describe('draft arms + privacy routing', () => {
    test('arms carry model, latency, char count from engine meta', () => {
        const lead = parseOpsLead({
            id: 1,
            draft_a: 'abc',
            draft_b: 'de',
            draft_meta: { model_a: 'qwen', model_b: 'glm-5', latency_a: 1.5, latency_b: 2.5 },
        })!;
        const [a, b] = draftArms(lead);
        expect(a).toMatchObject({ slot: 'a', model: 'qwen', latencySec: 1.5, charCount: 3 });
        expect(b).toMatchObject({ slot: 'b', model: 'glm-5', charCount: 2 });
    });

    test('privacy routing follows the pick', () => {
        const mk = (pick: string) => parseOpsLead({ id: 1, draft_pick: pick })!;
        expect(privacyRouting(mk('a'))).toBe('local');
        expect(privacyRouting(mk('b'))).toBe('cloud');
        expect(privacyRouting(mk(''))).toBe('undecided');
    });
});

describe('parseCatalogPrice + parseDeliveryOrder', () => {
    test('quote lookup by capability id', () => {
        const catalog = {
            capabilities: [
                { id: 'rag-qa', name_zh: 'RAG 问答', name_en: 'RAG QA', price_cny: 2000 },
            ],
        };
        expect(parseCatalogPrice(catalog, 'rag-qa')?.priceCny).toBe(2000);
        expect(parseCatalogPrice(catalog, 'missing')).toBeNull();
        expect(parseCatalogPrice(null, 'rag-qa')).toBeNull();
    });

    test('order row requires order_no', () => {
        expect(parseDeliveryOrder({ price_cny: 5 })).toBeNull();
        expect(parseDeliveryOrder({ order_no: 'D1', stage: 3 })?.stage).toBe('');
    });
});
