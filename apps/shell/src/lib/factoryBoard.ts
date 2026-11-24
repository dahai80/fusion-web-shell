import type { FactoryOrder } from './factoryApi';

/**
 * Factory ops board + metrics models (issue #188). Pure, framework-free —
 * mirrors the factory-e2e-prototype S0-S7 ladder. Everything here is a
 * read-only aggregation over the order list the shell already fetches; no
 * manual input anywhere.
 *
 * Honest data-source map (what each board column can actually see):
 * - S0/S1/S2/S3/S4/S5 derive from the order's lifecycle/status fields.
 * - S6 (warranty/issues) needs the GitHub private-repo issue surface that
 *   cowork's SyncIssuesNode writes to SQLite — no HTTP surface yet, so
 *   issue rows degrade to a pending state until fusion-site exposes one.
 * - S7 (settle + retro) has no record in the order list — column renders
 *   with a "no data source" hint.
 */

export interface FactoryStage {
    id: string;
    zh: string;
    en: string;
}

export const FACTORY_STAGES: readonly FactoryStage[] = [
    { id: 'S0', zh: '建单+建仓', en: 'Order + repo' },
    { id: 'S1', zh: '需求冻结 SOW', en: 'SOW freeze' },
    { id: 'S2', zh: '架构/DAG 拆解', en: 'Arch/DAG breakdown' },
    { id: 'S3', zh: 'Coding', en: 'Coding' },
    { id: 'S4', zh: 'Validation', en: 'Validation' },
    { id: 'S5', zh: '客户验收', en: 'Customer acceptance' },
    { id: 'S6', zh: 'Issue/保修', en: 'Issue/warranty' },
    { id: 'S7', zh: '回款+复盘', en: 'Settle + retro' },
];

/** Errored = db enum status or a non-empty error string. */
export function isOrderErrored(order: FactoryOrder): boolean {
    return order.status === 'order_error' || Boolean(order.order_error);
}

/** Stage id an order lands in, or null when no list field carries evidence. */
export function stageFromFactoryOrder(order: FactoryOrder): string | null {
    const lifecycle = (order as FactoryOrder & { lifecycle?: string }).lifecycle;
    if (isOrderErrored(order)) return null;
    switch (lifecycle) {
        case 'intake':
            return 'S0';
        case 'prd':
            return 'S1';
        case 'prepay':
            return 'S2';
        case 'build':
            return 'S3';
        case 'qa':
            return 'S4';
        case 'accept':
            return 'S5';
        case 'deliver':
            return 'S6';
        default:
            break;
    }
    switch (order.status) {
        case 'created':
            return 'S0';
        case 'paid_mock':
            return 'S2';
        case 'building':
            return 'S3';
        case 'delivered':
            return 'S6';
        default:
            return null;
    }
}

/** Stage buckets plus the honest unknown/errored catch-alls. */
export interface BoardColumns {
    unknown: FactoryOrder[];
    errored: FactoryOrder[];
    [stageId: string]: FactoryOrder[];
}

/** Orders bucketed per stage id; orders with no evidence land in `unknown`. */
export function boardColumns(orders: FactoryOrder[]): BoardColumns {
    const cols: BoardColumns = { unknown: [], errored: [] };
    for (const s of FACTORY_STAGES) cols[s.id] = [];
    for (const o of orders) {
        if (isOrderErrored(o)) {
            cols.errored.push(o);
            continue;
        }
        const stage = stageFromFactoryOrder(o);
        if (stage) cols[stage]?.push(o);
        else cols.unknown.push(o);
    }
    return cols;
}

/**
 * Warranty-issue desk model (S6). Shape mirrors cowork SyncIssuesNode's
 * order_issues rows (repo/issue_id/title/labels/state/sla_hours/created_at)
 * plus the operator SLA state machine from the prototype:
 * triaged → in-progress → fixed → awaiting-customer → closed.
 * No HTTP surface exists yet (cowork writes SQLite only); parsers land now
 * so wiring is drop-in when fusion-site/cowork expose the plane.
 */
export type IssueStatus = 'triaged' | 'in-progress' | 'fixed' | 'awaiting-customer' | 'closed';

export const ISSUE_STATUSES: readonly IssueStatus[] = [
    'triaged',
    'in-progress',
    'fixed',
    'awaiting-customer',
    'closed',
];

export interface FactoryIssue {
    id: string;
    repo: string;
    issueNumber: number;
    title: string;
    orderId: string | null;
    status: IssueStatus;
    slaHours: number | null;
    createdAt: string;
}

function parseIssueStatus(raw: unknown): IssueStatus {
    return ISSUE_STATUSES.includes(raw as IssueStatus) ? (raw as IssueStatus) : 'triaged';
}

/** Parse an issue row; drops rows without an id. Never throws. */
export function parseFactoryIssue(raw: unknown): FactoryIssue | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : typeof r.issue_id === 'string' ? r.issue_id : '';
    if (!id) return null;
    return {
        id,
        repo: typeof r.repo === 'string' ? r.repo : '',
        issueNumber: typeof r.issue_id === 'number' ? r.issue_id : 0,
        title: typeof r.title === 'string' ? r.title : '',
        orderId: typeof r.order_id === 'string' ? r.order_id : null,
        status: parseIssueStatus(r.status ?? r.state),
        slaHours: typeof r.sla_hours === 'number' ? r.sla_hours : null,
        createdAt: typeof r.created_at === 'string' ? r.created_at : '',
    };
}

export function parseFactoryIssues(raw: unknown): FactoryIssue[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(parseFactoryIssue).filter((x): x is FactoryIssue => x !== null);
}

/** Hours elapsed since createdAt (negative-safe; invalid dates → null). */
export function issueAgeHours(issue: FactoryIssue, now: number = Date.now()): number | null {
    const then = Date.parse(issue.createdAt);
    if (Number.isNaN(then)) return null;
    return Math.max(0, (now - then) / 3600000);
}

/** Overdue = non-closed issue whose age passed its SLA budget (null SLA → never). */
export function isIssueOverdue(issue: FactoryIssue, now: number = Date.now()): boolean {
    if (issue.status === 'closed' || issue.slaHours === null) return false;
    const age = issueAgeHours(issue, now);
    return age !== null && age > issue.slaHours;
}

export interface OpsMetrics {
    total: number;
    byLifecycle: Record<string, number>;
    /** won terminals / all terminals (delivered vs errored); null when none. */
    winRate: number | null;
    /** orders carrying an order_error / total; null when empty. */
    errorRate: number | null;
    /** null: no delivery-timestamp source in the order list yet. */
    avgDeliveryHours: null;
    /** null: rework tickets have no HTTP surface yet. */
    reworkRate: null;
}

/** Metrics computed purely from the fetched order list — no manual input. */
export function computeOpsMetrics(orders: FactoryOrder[]): OpsMetrics {
    const byLifecycle: Record<string, number> = {};
    let delivered = 0;
    let errored = 0;
    for (const o of orders) {
        const key = (o as FactoryOrder & { lifecycle?: string }).lifecycle ?? o.status;
        byLifecycle[key] = (byLifecycle[key] ?? 0) + 1;
        if (o.status === 'delivered') delivered += 1;
        if (isOrderErrored(o)) errored += 1;
    }
    const terminals = delivered + errored;
    return {
        total: orders.length,
        byLifecycle,
        winRate: terminals > 0 ? delivered / terminals : null,
        errorRate: orders.length > 0 ? errored / orders.length : null,
        avgDeliveryHours: null,
        reworkRate: null,
    };
}
