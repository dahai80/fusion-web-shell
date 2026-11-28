import { sharedClient } from '@/api/client';

/**
 * Factory ops console data layer (issue #197, plan §4.3). Consumes the
 * cowork demand/delivery web API through the gateway shell module proxy —
 * the frontend renders only what the engine returns (site#102 zero-mock
 * rule); every field is defensively parsed and test-pinned.
 *
 * Event-driven refresh (plan ruling A1): the demand/delivery engine does
 * not expose an SSE/outbox HTTP surface yet (only the run screenshot
 * stream), so the page polls on an interval with manual refresh — the
 * fallback the ruling allows. When the engine ships the event surface,
 * swap `startPolling` for an SSE subscription.
 */

const COWORK_PREFIX = '/shell/fusion-cowork/api';

/** Real lead statuses (demand store schema + match pipeline). */
export const LEAD_STATUSES = [
    'normalized',
    'parked',
    'matched',
    'drafted',
    'approved',
    'discarded',
    'spam',
    'duplicate',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface OpsLead {
    id: number;
    source: string;
    title: string;
    description: string;
    status: string;
    budgetHint: string;
    matchScore: number;
    matchReason: string;
    matchedCapabilities: string[];
    arrivedAt: number;
    draftA: string;
    draftB: string;
    draftMeta: DraftMeta;
    draftPick: string;
    draftFinal: string;
    editDistance: number;
}

export interface DraftMeta {
    modelA: string;
    modelB: string;
    latencyA: number | null;
    latencyB: number | null;
    errors: string[];
}

interface RawLead {
    id?: unknown;
    source?: unknown;
    title?: unknown;
    description?: unknown;
    status?: unknown;
    budget_hint?: unknown;
    match_score?: unknown;
    match_reason?: unknown;
    matched_capabilities?: unknown;
    arrived_at?: unknown;
    draft_a?: unknown;
    draft_b?: unknown;
    draft_meta?: unknown;
    draft_pick?: unknown;
    draft_final?: unknown;
    draft_edit_distance?: unknown;
}

/** Defensive parse of one demand-engine lead row. */
export function parseOpsLead(raw: unknown): OpsLead | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as RawLead;
    if (typeof r.id !== 'number') return null;
    const meta =
        r.draft_meta && typeof r.draft_meta === 'object'
            ? (r.draft_meta as Record<string, unknown>)
            : {};
    return {
        id: r.id,
        source: typeof r.source === 'string' ? r.source : '',
        title: typeof r.title === 'string' ? r.title : '',
        description: typeof r.description === 'string' ? r.description : '',
        status: typeof r.status === 'string' ? r.status : 'unknown',
        budgetHint: typeof r.budget_hint === 'string' ? r.budget_hint : '',
        matchScore: typeof r.match_score === 'number' ? r.match_score : 0,
        matchReason: typeof r.match_reason === 'string' ? r.match_reason : '',
        matchedCapabilities: Array.isArray(r.matched_capabilities)
            ? r.matched_capabilities.filter((c): c is string => typeof c === 'string')
            : [],
        arrivedAt: typeof r.arrived_at === 'number' ? r.arrived_at : 0,
        draftA: typeof r.draft_a === 'string' ? r.draft_a : '',
        draftB: typeof r.draft_b === 'string' ? r.draft_b : '',
        draftMeta: {
            modelA: typeof meta.model_a === 'string' ? meta.model_a : '',
            modelB: typeof meta.model_b === 'string' ? meta.model_b : '',
            latencyA: typeof meta.latency_a === 'number' ? meta.latency_a : null,
            latencyB: typeof meta.latency_b === 'number' ? meta.latency_b : null,
            errors: Array.isArray(meta.errors)
                ? meta.errors.filter((e): e is string => typeof e === 'string')
                : [],
        },
        draftPick: typeof r.draft_pick === 'string' ? r.draft_pick : '',
        draftFinal: typeof r.draft_final === 'string' ? r.draft_final : '',
        editDistance: typeof r.draft_edit_distance === 'number' ? r.draft_edit_distance : -1,
    };
}

export interface CatalogCapability {
    id: string;
    nameZh: string;
    nameEn: string;
    priceCny: number;
}

/** Quote card row: capability catalog price (plan §4.3 报价卡). */
export function parseCatalogPrice(
    catalog: unknown,
    capabilityId: string
): CatalogCapability | null {
    if (!catalog || typeof catalog !== 'object') return null;
    const caps = (catalog as { capabilities?: unknown }).capabilities;
    if (!Array.isArray(caps)) return null;
    for (const c of caps) {
        if (!c || typeof c !== 'object') continue;
        const row = c as Record<string, unknown>;
        if (row.id !== capabilityId) continue;
        return {
            id: capabilityId,
            nameZh: typeof row.name_zh === 'string' ? row.name_zh : capabilityId,
            nameEn: typeof row.name_en === 'string' ? row.name_en : capabilityId,
            priceCny: typeof row.price_cny === 'number' ? row.price_cny : 0,
        };
    }
    return null;
}

export interface DeliveryOrder {
    orderNo: string;
    leadId: number;
    capability: string;
    title: string;
    priceCny: number;
    stage: string;
    createdAt: number;
}

interface RawOrder {
    order_no?: unknown;
    lead_id?: unknown;
    capability?: unknown;
    title?: unknown;
    price_cny?: unknown;
    stage?: unknown;
    created_at?: unknown;
}

/** Defensive parse of GET /api/delivery/orders rows. */
export function parseDeliveryOrder(raw: unknown): DeliveryOrder | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as RawOrder;
    if (typeof r.order_no !== 'string' || !r.order_no) return null;
    return {
        orderNo: r.order_no,
        leadId: typeof r.lead_id === 'number' ? r.lead_id : 0,
        capability: typeof r.capability === 'string' ? r.capability : '',
        title: typeof r.title === 'string' ? r.title : '',
        priceCny: typeof r.price_cny === 'number' ? r.price_cny : 0,
        stage: typeof r.stage === 'string' ? r.stage : '',
        createdAt: typeof r.created_at === 'number' ? r.created_at : 0,
    };
}

export interface AbTelemetry {
    totalPicks: number;
    pickRateLocal: number;
    pickRateCloud: number;
    avgEditDistance: number;
}

/** A/B telemetry from GET /api/demand/metrics. */
export function parseAbTelemetry(payload: unknown): AbTelemetry {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    return {
        totalPicks: typeof p.total_picks === 'number' ? p.total_picks : 0,
        pickRateLocal: typeof p.pick_rate_local === 'number' ? p.pick_rate_local : 0,
        pickRateCloud: typeof p.pick_rate_cloud === 'number' ? p.pick_rate_cloud : 0,
        avgEditDistance: typeof p.avg_edit_distance === 'number' ? p.avg_edit_distance : 0,
    };
}

/** Ops metrics cards (plan §4.3) — computed from engine data only. */
export interface ConsoleMetrics {
    newLeads: number;
    pendingDraft: number;
    quoted: number;
    inDelivery: number;
    monthlyRevenueCny: number;
}

/**
 * Card counts from real lead rows + delivery orders.
 * 新线索 = normalized+parked; 待双草稿 = matched (awaiting generation);
 * 已报价 = drafted (quote visible, awaiting approval); 交付中 = delivery
 * orders past creation; 本月收入 = sum of this month's order price_cny.
 */
export function computeConsoleMetrics(
    leads: OpsLead[],
    orders: DeliveryOrder[],
    now: number = Date.now()
): ConsoleMetrics {
    let newLeads = 0;
    let pendingDraft = 0;
    let quoted = 0;
    for (const l of leads) {
        if (l.status === 'normalized' || l.status === 'parked') newLeads += 1;
        else if (l.status === 'matched') pendingDraft += 1;
        else if (l.status === 'drafted') quoted += 1;
    }
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    let inDelivery = 0;
    let monthlyRevenueCny = 0;
    for (const o of orders) {
        if (o.stage && o.stage !== 'created') inDelivery += 1;
        if (o.createdAt * 1000 >= monthStart.getTime()) monthlyRevenueCny += o.priceCny;
    }
    return { newLeads, pendingDraft, quoted, inDelivery, monthlyRevenueCny };
}

/** Draft arm view model — one side of the A/B pair. */
export interface DraftArm {
    slot: 'a' | 'b';
    model: string;
    latencySec: number | null;
    charCount: number;
    text: string;
}

export function draftArms(lead: OpsLead): DraftArm[] {
    return [
        {
            slot: 'a',
            model: lead.draftMeta.modelA || 'local',
            latencySec: lead.draftMeta.latencyA,
            charCount: lead.draftA.length,
            text: lead.draftA,
        },
        {
            slot: 'b',
            model: lead.draftMeta.modelB || 'cloud',
            latencySec: lead.draftMeta.latencyB,
            charCount: lead.draftB.length,
            text: lead.draftB,
        },
    ];
}

/** Privacy routing: pick 'a' = local-only, 'b' = cloud-touched (warning). */
export function privacyRouting(lead: OpsLead): 'local' | 'cloud' | 'undecided' {
    if (lead.draftPick === 'a') return 'local';
    if (lead.draftPick === 'b') return 'cloud';
    return 'undecided';
}

interface ListPayload {
    leads?: unknown;
    orders?: unknown;
    count?: unknown;
}

async function getJson<T>(path: string): Promise<T> {
    return sharedClient().get<T>(path, { quiet: true });
}

/** Lead inbox from GET /api/demand/leads (real DB, real statuses). */
export async function fetchOpsLeads(status = ''): Promise<OpsLead[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const payload = await getJson<ListPayload>(`${COWORK_PREFIX}/demand/leads${q}`);
    const rows = Array.isArray(payload?.leads) ? payload.leads : [];
    return rows.map(parseOpsLead).filter((l): l is OpsLead => l !== null);
}

/** Lead detail (same endpoint shape as list rows). */
export async function fetchOpsLead(leadId: number): Promise<OpsLead | null> {
    const payload = await getJson<unknown>(`${COWORK_PREFIX}/demand/leads/${leadId}`);
    return parseOpsLead(payload);
}

/** Capability catalog for quote cards. */
export async function fetchOpsCatalog(): Promise<unknown> {
    return getJson<unknown>(`${COWORK_PREFIX}/demand/catalog`);
}

/** A/B telemetry. */
export async function fetchOpsTelemetry(): Promise<AbTelemetry> {
    return parseAbTelemetry(await getJson<unknown>(`${COWORK_PREFIX}/demand/metrics`));
}

/** Delivery rail from GET /api/delivery/orders. */
export async function fetchDeliveryOrders(stage = ''): Promise<DeliveryOrder[]> {
    const q = stage ? `?stage=${encodeURIComponent(stage)}` : '';
    const payload = await getJson<ListPayload>(`${COWORK_PREFIX}/delivery/orders${q}`);
    const rows = Array.isArray(payload?.orders) ? payload.orders : [];
    return rows.map(parseDeliveryOrder).filter((o): o is DeliveryOrder => o !== null);
}

export interface ApproveResult {
    ok: boolean;
    status: number;
    detail: string;
}

/**
 * Approve a drafted lead: pick a/b, optionally edited text. 409 = not in
 * drafted state; 400 = invalid pick. Detail surfaced verbatim.
 */
export async function approveOpsLead(
    leadId: number,
    pick: 'a' | 'b',
    editedText: string
): Promise<ApproveResult> {
    try {
        await sharedClient().post(
            `${COWORK_PREFIX}/demand/leads/${leadId}/approve`,
            { pick, text: editedText },
            { quiet: true }
        );
        console.log(
            `[ops-console] lead ${leadId} approved pick=${pick} edited=${Boolean(editedText)}`
        );
        return { ok: true, status: 200, detail: '' };
    } catch (err) {
        const status = (err as { status?: number }).status ?? 0;
        const detail = (err as { message?: string }).message ?? 'approve failed';
        console.warn(`[ops-console] lead ${leadId} approve failed status=${status}: ${detail}`);
        return { ok: false, status, detail };
    }
}

/** Discard a lead with a reason (real engine endpoint). */
export async function discardOpsLead(leadId: number, reason: string): Promise<ApproveResult> {
    try {
        await sharedClient().post(
            `${COWORK_PREFIX}/demand/leads/${leadId}/discard`,
            { reason },
            { quiet: true }
        );
        console.log(`[ops-console] lead ${leadId} discarded`);
        return { ok: true, status: 200, detail: '' };
    } catch (err) {
        const status = (err as { status?: number }).status ?? 0;
        const detail = (err as { message?: string }).message ?? 'discard failed';
        console.warn(`[ops-console] lead ${leadId} discard failed status=${status}: ${detail}`);
        return { ok: false, status, detail };
    }
}
