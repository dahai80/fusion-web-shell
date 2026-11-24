import { sharedClient } from '@/api/client';

/**
 * Factory approval cards from the cowork demand engine + delivery rail
 * (issue #183, cowork#597/#603). Two card families feed the unified typed
 * approval inbox:
 *   demand/draft  — approved leads awaiting human send + deal confirmation
 *                   (GET /api/demand/leads?status=approved; resolve happens
 *                   in the cowork demand GUI, shell deep-links there)
 *   delivery/gate — orders parked on human gates (SOW / TAD, stage
 *                   sow_gate|tad_gate in GET /api/delivery/orders; resolve =
 *                   POST /api/delivery/orders/{order_no}/approve)
 */

const COWORK_PREFIX = '/shell/fusion-cowork/api';

export interface DemandDraftCard {
    leadId: number;
    title: string;
    source: string;
    draftFinal: string;
    arrivedAt: number;
}

export interface DeliveryGateCard {
    orderNo: string;
    title: string;
    capability: string;
    stage: 'sow_gate' | 'tad_gate';
    priceCny: number;
}

interface RawLead {
    id?: unknown;
    title?: unknown;
    source?: unknown;
    draft_final?: unknown;
    arrived_at?: unknown;
    status?: unknown;
}

interface RawOrder {
    order_no?: unknown;
    title?: unknown;
    capability?: unknown;
    stage?: unknown;
    price_cny?: unknown;
}

const GATE_STAGES: ReadonlySet<string> = new Set(['sow_gate', 'tad_gate']);

/** Filter + normalize approved leads (pure, test-pinned). */
export function parseDemandDrafts(payload: unknown): DemandDraftCard[] {
    const leads =
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { leads?: unknown }).leads)
            ? ((payload as { leads: unknown[] }).leads as RawLead[])
            : [];
    const cards: DemandDraftCard[] = [];
    for (const l of leads) {
        if (l.status !== 'approved' || typeof l.id !== 'number') continue;
        cards.push({
            leadId: l.id,
            title: typeof l.title === 'string' ? l.title : '',
            source: typeof l.source === 'string' ? l.source : '',
            draftFinal: typeof l.draft_final === 'string' ? l.draft_final : '',
            arrivedAt: typeof l.arrived_at === 'number' ? l.arrived_at : 0,
        });
    }
    return cards;
}

/** Filter + normalize orders parked on human gates (pure, test-pinned). */
export function parseDeliveryGates(payload: unknown): DeliveryGateCard[] {
    const orders =
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { orders?: unknown }).orders)
            ? ((payload as { orders: unknown[] }).orders as RawOrder[])
            : [];
    const cards: DeliveryGateCard[] = [];
    for (const o of orders) {
        if (
            typeof o.order_no !== 'string' ||
            o.order_no === '' ||
            typeof o.stage !== 'string' ||
            !GATE_STAGES.has(o.stage)
        ) {
            continue;
        }
        cards.push({
            orderNo: o.order_no,
            title: typeof o.title === 'string' ? o.title : '',
            capability: typeof o.capability === 'string' ? o.capability : '',
            stage: o.stage as DeliveryGateCard['stage'],
            priceCny: typeof o.price_cny === 'number' ? o.price_cny : 0,
        });
    }
    return cards;
}

/** Approved leads awaiting human send / deal confirmation. */
export async function fetchDemandDrafts(): Promise<DemandDraftCard[]> {
    const data = await sharedClient().get<{ leads?: RawLead[] }>(
        `${COWORK_PREFIX}/demand/leads?status=approved`,
        { quiet: true }
    );
    return parseDemandDrafts(data);
}

/** Orders parked on a human gate in the S0-S7 ladder. */
export async function fetchDeliveryGates(): Promise<DeliveryGateCard[]> {
    const data = await sharedClient().get<{ orders?: RawOrder[] }>(
        `${COWORK_PREFIX}/delivery/orders`,
        { quiet: true }
    );
    return parseDeliveryGates(data);
}

/** Human gate advance — the only path that moves an order to the next stage. */
export async function approveDeliveryGate(orderNo: string): Promise<void> {
    await sharedClient().post(`${COWORK_PREFIX}/delivery/orders/${orderNo}/approve`, undefined, {
        quiet: true,
    });
}
