import { sharedClient } from '@/api/client';
import type { RunLifecycle } from '@/lib/agentsApi';

/**
 * Software factory operator data layer (issue #179). Consumes the live
 * fusion-site surfaces through the gateway shell proxy
 * (`/shell/fusion-site/api/factory/*`, host Bearer, no new backend):
 *   GET  /order                    -> { orders: [...] }   (caller's own rows)
 *   PUT  /order                    -> mock payment { factory_order_id }
 *   GET  /orders/notifications     -> { items: [...] }    (bell source, R4)
 *   GET  /pricing                  -> { active, versions }
 *   POST /pricing                  -> save-as-new-version
 *   GET  /discounts                -> { discounts: [...] }
 *   POST /discounts                -> create rule / toggle { id, active }
 * Contracts pinned against fusion-site#105/#111/#112 route sources
 * (read-only upstream inspection, 2026-11-20).
 */

const PREFIX = '/shell/fusion-site/api/factory';

/** Row shape of factory_orders as returned by GET /order (snake_case). */
export interface FactoryOrder {
    id: string;
    flow_id: string;
    order_id: string;
    acceptance: string;
    price_cny: number;
    price_usd: number;
    currency: string;
    /** created | paid_mock | building | delivered | order_error (db enum). */
    status: string;
    order_error: string;
    created_at: string;
}

/**
 * Payment-flow status → unified run lifecycle (issue #177 R2 enum). Mirrors
 * fusion-site src/lib/factory-run.ts `orderRunStatus` so the shell and the
 * site cannot disagree; unknown statuses must not masquerade as healthy.
 */
export function lifecycleFromFactoryOrder(status: string): RunLifecycle {
    switch (status) {
        case 'created':
            return 'queued';
        case 'paid_mock':
            return 'awaiting_human';
        case 'building':
            return 'running';
        case 'delivered':
            return 'done';
        case 'order_error':
            return 'error';
        default:
            return 'blocked';
    }
}

/** Visual chip per lifecycle (shell tokens; label mirror of LIFECYCLE_LABEL). */
export const LIFECYCLE_CHIP: Record<RunLifecycle, { zh: string; en: string; cls: string }> = {
    queued: { zh: '排队中', en: 'Queued', cls: 'bg-bg-muted text-text-secondary' },
    running: { zh: '运行中', en: 'Running', cls: 'bg-brand/10 text-brand' },
    awaiting_human: { zh: '等待人工', en: 'Awaiting human', cls: 'bg-warning/10 text-warning' },
    blocked: { zh: '受阻', en: 'Blocked', cls: 'bg-warning/10 text-warning' },
    done: { zh: '已完成', en: 'Done', cls: 'bg-success/10 text-success' },
    error: { zh: '出错', en: 'Error', cls: 'bg-error/10 text-error' },
};

/** Operator work queues (issue #179 item 1): orders split by who owes the
 *  next action — the customer owes payment on `created`, the operator owes
 *  kickoff on `paid_mock`; everything else is in-flight or terminal. */
export interface OrderQueues {
    customerOwed: FactoryOrder[];
    operatorOwed: FactoryOrder[];
    inFlight: FactoryOrder[];
}

export function splitOrderQueues(orders: FactoryOrder[]): OrderQueues {
    const customerOwed: FactoryOrder[] = [];
    const operatorOwed: FactoryOrder[] = [];
    const inFlight: FactoryOrder[] = [];
    for (const o of orders) {
        if (o.status === 'created') customerOwed.push(o);
        else if (o.status === 'paid_mock') operatorOwed.push(o);
        else inFlight.push(o);
    }
    return { customerOwed, operatorOwed, inFlight };
}

/** Parse the acceptance JSON column into display criteria (pure). */
export function acceptanceItems(order: Pick<FactoryOrder, 'acceptance'>): string[] {
    try {
        const list = JSON.parse(order.acceptance) as unknown;
        return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

export async function fetchFactoryOrders(): Promise<FactoryOrder[]> {
    const data = await sharedClient().get<{ orders?: FactoryOrder[] }>(`${PREFIX}/order`, {
        quiet: true,
    });
    return Array.isArray(data.orders) ? data.orders : [];
}

/** Explicit MOCK payment click-through (fusion-site#66 contract). */
export async function payFactoryOrder(factoryOrderId: string): Promise<void> {
    await sharedClient().put<{ factory_order_id: string; status: string }>(`${PREFIX}/order`, {
        factory_order_id: factoryOrderId,
    });
}

export interface PriceEntry {
    module_key: string;
    price_cny: number;
    price_usd: number;
}

export interface PriceVersion {
    id: string;
    version: number;
    status: string;
    cost_protection_floor_cny: number;
    created_by: string;
    created_at: string;
    prices: PriceEntry[];
}

export interface PricingBook {
    active: PriceVersion | null;
    versions: PriceVersion[];
}

export async function fetchPricing(): Promise<PricingBook> {
    return sharedClient().get<PricingBook>(`${PREFIX}/pricing`, { quiet: true });
}

/** Save-as-new-version: the previous active version is superseded
 *  server-side; in-flight orders stay pinned to their quote snapshot. */
export async function savePricingVersion(
    prices: PriceEntry[],
    costProtectionFloorCny: number
): Promise<{ version: number }> {
    return sharedClient().post<{ id: string; version: number; status: string }>(
        `${PREFIX}/pricing`,
        { prices, cost_protection_floor_cny: costProtectionFloorCny }
    );
}

export type DiscountKind = 'first_order' | 'spend_threshold' | 'promo' | 'channel';

export const DISCOUNT_KINDS: DiscountKind[] = [
    'first_order',
    'spend_threshold',
    'promo',
    'channel',
];

export interface DiscountRule {
    id: string;
    kind: string;
    code: string;
    label: string;
    percent_off: number;
    min_spend_cny: number;
    max_uses: number;
    used_count: number;
    stackable_with: string[];
    active: boolean;
    created_by: string;
    created_at: string;
}

export interface DiscountDraft {
    kind: DiscountKind;
    code: string;
    label: string;
    percent_off: number;
    min_spend_cny: number;
    max_uses: number;
    stackable_with: string[];
}

export async function fetchDiscounts(): Promise<DiscountRule[]> {
    const data = await sharedClient().get<{ discounts?: DiscountRule[] }>(`${PREFIX}/discounts`, {
        quiet: true,
    });
    return Array.isArray(data.discounts) ? data.discounts : [];
}

export async function createDiscount(draft: DiscountDraft): Promise<void> {
    await sharedClient().post(`${PREFIX}/discounts`, {
        kind: draft.kind,
        code: draft.code,
        label: draft.label,
        percent_off: draft.percent_off,
        min_spend_cny: draft.min_spend_cny,
        max_uses: draft.max_uses,
        stackable_with: draft.stackable_with,
    });
}

/** Toggle path rides POST with an existing id (fusion-site#112 contract). */
export async function toggleDiscount(id: string, active: boolean): Promise<void> {
    await sharedClient().post(`${PREFIX}/discounts`, { id, active });
}
