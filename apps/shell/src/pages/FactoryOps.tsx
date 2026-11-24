import { pushToast } from '@/components/ToastHost';
import {
    DISCOUNT_KINDS,
    type DiscountDraft,
    type DiscountRule,
    type FactoryOrder,
    LIFECYCLE_CHIP,
    type PriceEntry,
    type PricingBook,
    acceptanceItems,
    createDiscount,
    fetchDiscounts,
    fetchFactoryOrders,
    fetchPricing,
    lifecycleFromFactoryOrder,
    payFactoryOrder,
    savePricingVersion,
    splitOrderQueues,
    toggleDiscount,
} from '@/lib/factoryApi';
import {
    FACTORY_STAGES,
    type FactoryIssue,
    ISSUE_STATUSES,
    boardColumns,
    computeOpsMetrics,
    isIssueOverdue,
} from '@/lib/factoryBoard';
import { t, useLang } from '@/stores/lang';
import { EmptyState } from '@fusion/web-ui';
import { AlertTriangle, ClipboardList, Gauge, RefreshCw, Tag, Users } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';

/**
 * Factory Ops console (issues #179/#188): operator surface over the live
 * fusion-site factory APIs via the gateway shell proxy. Seven tabs —
 * order run queue (customer-owed vs operator-owed split, mock payment),
 * versioned price book, discount rules with the stackability matrix,
 * S0-S7 kanban board, warranty-issue desk (pending upstream surface),
 * customer view (pending upstream customer field), and metrics computed
 * from the order list. The DAG node graph stays an honest empty state
 * until the build pipeline exposes per-node data (fusion-site#102/#106).
 */

type LoadState = 'loading' | 'ready' | 'error';
type OpsTab = 'orders' | 'board' | 'issues' | 'customers' | 'metrics' | 'pricing' | 'discounts';

export function FactoryOpsPage() {
    useLang((l) => l.lang);
    const [tab, setTab] = useState<OpsTab>('orders');
    const [state, setState] = useState<LoadState>('loading');
    const [orders, setOrders] = useState<FactoryOrder[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [payingId, setPayingId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setState('loading');
        try {
            setOrders(await fetchFactoryOrders());
            setState('ready');
        } catch (err) {
            console.warn('[factoryOps] orders load failed:', err);
            setError(err instanceof Error ? err.message : String(err));
            setState('error');
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const onPay = async (order: FactoryOrder) => {
        setPayingId(order.id);
        try {
            await payFactoryOrder(order.id);
            pushToast('success', t('模拟支付已记录', 'Mock payment recorded'));
            setOrders(await fetchFactoryOrders());
        } catch (err) {
            console.warn('[factoryOps] mock pay failed:', order.id, err);
            pushToast('error', t('支付记录失败', 'Payment recording failed'));
        } finally {
            setPayingId(null);
        }
    };

    const queues = splitOrderQueues(orders);

    return (
        <div className="mx-auto max-w-7xl px-4 py-6">
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                        {t('工厂运营', 'Factory Ops')}
                    </h1>
                    <p className="mt-1 text-sm text-text-muted">
                        {t(
                            '订单队列 · 定价与折扣配置 · 审批台（融合站点工厂 API）',
                            'Order queue · pricing & discount config · approvals (fusion-site factory API)'
                        )}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void reload()}
                    className="fs-btn fs-btn-secondary"
                    aria-label={t('刷新', 'Refresh')}
                >
                    <RefreshCw
                        size={14}
                        aria-hidden
                        className={state === 'loading' ? 'animate-spin' : ''}
                    />
                    {t('刷新', 'Refresh')}
                </button>
            </div>

            <div className="mb-5 flex gap-1 border-b border-border text-sm">
                {(
                    [
                        ['orders', '订单队列', 'Orders'],
                        ['board', '看板', 'Board'],
                        ['issues', '工单台', 'Issues'],
                        ['customers', '客户视图', 'Customers'],
                        ['metrics', '运营指标', 'Metrics'],
                        ['pricing', '定价配置', 'Pricing'],
                        ['discounts', '折扣规则', 'Discounts'],
                    ] as [OpsTab, string, string][]
                ).map(([id, zh, en]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        aria-current={tab === id ? 'true' : undefined}
                        className={`rounded-t-lg px-3 py-2 ${
                            tab === id
                                ? 'border-b-2 border-brand font-medium text-brand'
                                : 'text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        {t(zh, en)}
                    </button>
                ))}
            </div>

            {state === 'error' ? (
                <div className="rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error">
                    {t('工厂 API 加载失败', 'Factory API load failed')}: {error}
                </div>
            ) : null}

            {tab === 'orders' ? (
                <OrdersTab
                    queues={queues}
                    payingId={payingId}
                    onPay={onPay}
                    loading={state === 'loading'}
                />
            ) : null}
            {tab === 'board' ? <BoardTab orders={orders} loading={state === 'loading'} /> : null}
            {tab === 'issues' ? <IssuesTab /> : null}
            {tab === 'customers' ? <CustomersTab orders={orders} /> : null}
            {tab === 'metrics' ? <MetricsTab orders={orders} /> : null}
            {tab === 'pricing' ? <PricingTab /> : null}
            {tab === 'discounts' ? <DiscountsTab /> : null}
        </div>
    );
}

function BoardTab({ orders, loading }: { orders: FactoryOrder[]; loading: boolean }) {
    const cols = boardColumns(orders);
    return (
        <div className="space-y-4">
            {cols.errored.length > 0 ? (
                <div className="rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error">
                    <span className="inline-flex items-center gap-1.5">
                        <AlertTriangle size={14} aria-hidden />
                        {t('异常订单', 'Errored orders')}: {cols.errored.length}
                    </span>
                </div>
            ) : null}
            <p className="text-xs text-text-muted">
                {t(
                    '只读聚合：状态真源在 fusion-site 订单生命周期；S7 回款暂无数据源。',
                    'Read-only aggregation: state truth lives in the fusion-site order lifecycle; S7 settle has no data source yet.'
                )}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                {FACTORY_STAGES.map((s) => {
                    const rows = cols[s.id] ?? [];
                    return (
                        <section
                            key={s.id}
                            aria-label={`${s.id} ${s.en}`}
                            className="rounded-2xl border border-border bg-bg-elevated p-3 shadow-sm"
                        >
                            <h3 className="flex items-baseline justify-between text-xs font-medium text-text-primary">
                                <span>{s.id}</span>
                                <span
                                    className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                                        rows.length > 0
                                            ? 'bg-brand/10 text-brand'
                                            : 'bg-bg-muted text-text-muted'
                                    }`}
                                >
                                    {rows.length}
                                </span>
                            </h3>
                            <p className="mt-0.5 text-[11px] leading-tight text-text-muted">
                                {t(s.zh, s.en)}
                            </p>
                            <ul className="mt-2 space-y-1.5">
                                {rows.map((o) => (
                                    <li
                                        key={o.id}
                                        className="rounded-lg border border-border bg-bg-muted px-2 py-1.5 text-[11px]"
                                    >
                                        <div className="truncate font-medium text-text-primary">
                                            {o.flow_id.slice(0, 12)}
                                        </div>
                                        <div className="text-text-muted">
                                            ¥{o.price_cny} · {o.created_at.slice(0, 10)}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {s.id === 'S7' && rows.length === 0 ? (
                                <p className="mt-2 text-[11px] text-text-muted">
                                    {t('无数据源', 'no data source')}
                                </p>
                            ) : null}
                        </section>
                    );
                })}
            </div>
            {cols.unknown.length > 0 ? (
                <p className="text-xs text-text-muted">
                    {t('未映射订单', 'Unmapped orders')}: {cols.unknown.length}
                </p>
            ) : null}
            {loading && orders.length === 0 ? (
                <p className="text-xs text-text-muted">{t('加载中…', 'Loading…')}</p>
            ) : null}
        </div>
    );
}

const ISSUE_SLA_CLS: Record<string, string> = {
    triaged: 'bg-bg-muted text-text-secondary',
    'in-progress': 'bg-brand/10 text-brand',
    fixed: 'bg-success/10 text-success',
    'awaiting-customer': 'bg-warning/10 text-warning',
    closed: 'bg-bg-muted text-text-muted',
};

function IssuesTab() {
    // No HTTP surface yet: cowork SyncIssuesNode writes order_issues to
    // SQLite only (fusion-cowork delivery/nodes.py); fusion-site/cowork
    // expose no read endpoint. Honest pending state until one lands.
    const issues: FactoryIssue[] = [];
    const overdue = issues.filter((i) => isIssueOverdue(i));
    return (
        <div className="space-y-5">
            <section className="rounded-2xl border border-dashed border-border p-4">
                <h2 className="text-sm font-medium text-text-primary">
                    {t('GitHub 私有仓工单台', 'GitHub private-repo issue desk')}
                </h2>
                <EmptyState
                    title={t('工单数据源未接入', 'Issue data source not wired yet')}
                    description={t(
                        'cowork SyncIssuesNode 目前只写本地 SQLite（order_issues），无 HTTP 读取面。接入后此处展示 SLA 状态机与超时告警。',
                        'cowork SyncIssuesNode writes order_issues to local SQLite only — no HTTP read surface yet. SLA state machine + overdue alerts land once one is exposed.'
                    )}
                />
            </section>
            <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
                <h2 className="text-sm font-medium text-text-primary">
                    {t('SLA 状态机', 'SLA state machine')}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {ISSUE_STATUSES.map((s, i) => (
                        <Fragment key={s}>
                            {i > 0 ? <span className="text-text-muted">→</span> : null}
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    ISSUE_SLA_CLS[s]
                                }`}
                            >
                                {s}
                            </span>
                        </Fragment>
                    ))}
                </div>
                <p className="mt-2 text-xs text-text-muted">
                    {t(
                        '超时判定：未关闭工单 age > sla_hours 即标记超时（SLA 计时器 + 告警）。',
                        'Overdue rule: a non-closed issue with age > sla_hours is flagged (SLA timer + warning).'
                    )}
                </p>
            </section>
            {overdue.length > 0 ? (
                <section className="rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error">
                    {t('超时工单', 'Overdue issues')}: {overdue.length}
                </section>
            ) : null}
        </div>
    );
}

function CustomersTab({ orders }: { orders: FactoryOrder[] }) {
    // FactoryOrder carries no customer column (userSub-scoped list, no
    // customer join exposed) — per-customer grouping is impossible without
    // lying. Pending an upstream customer surface (fusion-site).
    return (
        <section className="rounded-2xl border border-dashed border-border p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Users size={15} aria-hidden className="text-text-muted" />
                {t('客户视图', 'Customer view')}
            </h2>
            <EmptyState
                title={t('订单无客户字段', 'Orders carry no customer field')}
                description={t(
                    `当前工厂订单列表按下单用户隔离且不含客户标识，无法按客户聚合（共 ${orders.length} 单）。待 fusion-site 暴露客户维度后接入。`,
                    `The factory order list is user-scoped and carries no customer identifier, so per-customer grouping is impossible (${orders.length} orders total). Lands once fusion-site exposes a customer dimension.`
                )}
            />
        </section>
    );
}

function MetricsTab({ orders }: { orders: FactoryOrder[] }) {
    const m = computeOpsMetrics(orders);
    const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
    const cards: [string, string, string, string][] = [
        [
            t('订单总数', 'Total orders'),
            String(m.total),
            t('来自订单列表', 'from the order list'),
            'text-text-primary',
        ],
        [
            t('赢单率', 'Win rate'),
            pct(m.winRate),
            t('已交付 / (已交付+异常)', 'delivered / (delivered + errored)'),
            m.winRate === null ? 'text-text-muted' : 'text-success',
        ],
        [
            t('异常率', 'Error rate'),
            pct(m.errorRate),
            t('order_error / 总数', 'order_error / total'),
            m.errorRate === null ? 'text-text-muted' : 'text-error',
        ],
        [
            t('平均交付时长', 'Avg delivery time'),
            '—',
            t('缺交付时间戳数据源', 'no delivery-timestamp source yet'),
            'text-text-muted',
        ],
        [
            t('返工率', 'Rework rate'),
            '—',
            t('工单面未接入', 'issue surface not wired yet'),
            'text-text-muted',
        ],
    ];
    return (
        <div className="space-y-4">
            <p className="text-xs text-text-muted">
                {t(
                    '全部由订单列表记录计算，无人工输入；标 “—” 的指标缺数据源，如实展示。',
                    'All computed from order-list records with no manual input; “—” marks metrics whose data source does not exist yet, shown honestly.'
                )}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {cards.map(([label, value, source, cls]) => (
                    <div
                        key={label}
                        className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm"
                    >
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                            <Gauge size={13} aria-hidden />
                            {label}
                        </div>
                        <div className={`mt-1.5 text-2xl font-semibold ${cls}`}>{value}</div>
                        <div className="mt-1 text-[11px] text-text-muted">{source}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LifecycleChip({ status }: { status: string }) {
    const lifecycle = lifecycleFromFactoryOrder(status);
    const chip = LIFECYCLE_CHIP[lifecycle];
    return (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.cls}`}>
            {t(chip.zh, chip.en)}
        </span>
    );
}

function OrderCard({
    order,
    owedLabel,
    paying,
    onPay,
}: {
    order: FactoryOrder;
    owedLabel: string;
    paying: boolean;
    onPay(): void;
}) {
    const criteria = acceptanceItems(order);
    return (
        <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
                <LifecycleChip status={order.status} />
                <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px] text-text-secondary">
                    {owedLabel}
                </span>
                <span className="ml-auto text-xs text-text-muted">{order.created_at}</span>
            </div>
            <div className="mt-2 font-medium text-text-primary">
                {t('订单', 'Order')} {order.flow_id.slice(0, 12)}
                {order.order_id ? (
                    <span className="ml-2 text-xs font-normal text-text-muted">
                        commerce #{order.order_id.slice(0, 8)}
                    </span>
                ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-muted">
                <span>
                    {t('报价', 'Quote')}{' '}
                    <b className="text-text-primary">
                        ¥{order.price_cny} / ${order.price_usd}
                    </b>
                </span>
                <span>
                    {t('验收项', 'Acceptance')}{' '}
                    <b className="text-text-primary">{criteria.length}</b>
                </span>
            </div>
            {criteria.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs text-text-secondary">
                    {criteria.slice(0, 3).map((c) => (
                        <li key={c} className="truncate">
                            {c}
                        </li>
                    ))}
                </ul>
            ) : null}
            {order.order_error ? (
                <div className="mt-2 rounded-lg border border-error/30 bg-error/5 px-2 py-1 text-xs text-error">
                    {order.order_error}
                </div>
            ) : null}
            <div className="mt-3 flex items-center justify-end border-t border-border pt-3">
                {order.status === 'created' ? (
                    <button
                        type="button"
                        onClick={onPay}
                        disabled={paying}
                        className="fs-btn fs-btn-primary text-xs disabled:opacity-50"
                    >
                        {t('模拟支付 (MOCK)', 'Mock payment (MOCK)')}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function OrdersTab({
    queues,
    payingId,
    onPay,
    loading,
}: {
    queues: ReturnType<typeof splitOrderQueues>;
    payingId: string | null;
    onPay(order: FactoryOrder): void;
    loading: boolean;
}) {
    const groups: [string, string, FactoryOrder[]][] = [
        [
            t('客户待支付', 'Customer owes payment'),
            'bg-warning/10 text-warning',
            queues.customerOwed,
        ],
        [
            t('待开工 (运营)', 'Operator owes kickoff'),
            'bg-brand/10 text-brand',
            queues.operatorOwed,
        ],
        [
            t('进行中 / 已完结', 'In-flight / terminal'),
            'bg-bg-muted text-text-secondary',
            queues.inFlight,
        ],
    ];
    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-dashed border-border p-4">
                <h2 className="text-sm font-medium text-text-primary">
                    {t('DAG 运行视图', 'DAG run view')}
                </h2>
                <EmptyState
                    title={t('构建管线尚未接入', 'Build pipeline not wired yet')}
                    description={t(
                        '工厂 v3 上线后这里展示订单 DAG 节点图（状态/档位/tokens/重试）。',
                        'Order DAG node graph (status/tier/tokens/retries) lands with factory v3.'
                    )}
                />
            </section>
            {groups.map(([label, chipCls, rows]) => (
                <Fragment key={label}>
                    <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <ClipboardList size={15} aria-hidden className="text-text-muted" />
                        {label}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${chipCls}`}>
                            {rows.length}
                        </span>
                    </h2>
                    {rows.length === 0 ? (
                        <p className="text-xs text-text-muted">{t('暂无订单', 'No orders')}</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                            {rows.map((o) => (
                                <OrderCard
                                    key={o.id}
                                    order={o}
                                    owedLabel={label}
                                    paying={payingId === o.id}
                                    onPay={() => void onPay(o)}
                                />
                            ))}
                        </div>
                    )}
                </Fragment>
            ))}
            {loading &&
            queues.customerOwed.length + queues.operatorOwed.length + queues.inFlight.length ===
                0 ? (
                <p className="text-xs text-text-muted">{t('加载中…', 'Loading…')}</p>
            ) : null}
        </div>
    );
}

function PricingTab() {
    const [state, setState] = useState<LoadState>('loading');
    const [book, setBook] = useState<PricingBook | null>(null);
    const [rows, setRows] = useState<PriceEntry[]>([]);
    const [floor, setFloor] = useState('0');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setState('loading');
        try {
            const data = await fetchPricing();
            setBook(data);
            setRows(data.active ? data.active.prices.map((p) => ({ ...p })) : []);
            setFloor(String(data.active?.cost_protection_floor_cny ?? 0));
            setState('ready');
        } catch (err) {
            console.warn('[factoryOps] pricing load failed:', err);
            setError(err instanceof Error ? err.message : String(err));
            setState('error');
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const onSave = async () => {
        setSaving(true);
        try {
            const floorCny = Number(floor) || 0;
            const res = await savePricingVersion(rows, floorCny);
            pushToast(
                'success',
                t(`已保存为版本 v${res.version}`, `Saved as version v${res.version}`)
            );
            await reload();
        } catch (err) {
            console.warn('[factoryOps] pricing save failed:', err);
            const detail = err instanceof Error ? err.message : String(err);
            pushToast('error', `${t('保存失败', 'Save failed')}: ${detail}`);
        } finally {
            setSaving(false);
        }
    };

    if (state === 'error') {
        return (
            <div className="rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
                <h2 className="text-sm font-medium text-text-primary">
                    {t('价格表（保存即新建版本）', 'Price book (save-as-new-version)')}
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                    {t(
                        '在途订单锚定下单时的报价快照，版本不可就地修改。',
                        'In-flight orders stay pinned to their quote snapshot; versions are never edited in place.'
                    )}
                </p>
                {rows.length === 0 ? (
                    <div className="mt-3">
                        <EmptyState
                            title={t('暂无激活版本', 'No active version')}
                            description={t(
                                '添加模块价格行后保存为首个版本。',
                                'Add module price rows and save the first version.'
                            )}
                        />
                    </div>
                ) : (
                    <div className="mt-3 space-y-2">
                        {rows.map((row, i) => (
                            <div
                                key={`${row.module_key}-${i}`}
                                className="flex flex-wrap items-center gap-2 text-sm"
                            >
                                <input
                                    type="text"
                                    value={row.module_key}
                                    readOnly
                                    aria-label={t('模块', 'Module')}
                                    className="w-40 rounded-lg border border-border bg-bg-muted px-2 py-1.5 text-text-primary"
                                />
                                <label className="flex items-center gap-1 text-xs text-text-muted">
                                    ¥
                                    <input
                                        type="number"
                                        min={0}
                                        value={row.price_cny}
                                        aria-label={t('人民币价', 'CNY price')}
                                        onChange={(e) =>
                                            setRows((prev) =>
                                                prev.map((p, j) =>
                                                    j === i
                                                        ? {
                                                              ...p,
                                                              price_cny: Number(e.target.value),
                                                          }
                                                        : p
                                                )
                                            )
                                        }
                                        className="w-28 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                                    />
                                </label>
                                <label className="flex items-center gap-1 text-xs text-text-muted">
                                    $
                                    <input
                                        type="number"
                                        min={0}
                                        value={row.price_usd}
                                        aria-label={t('美元价', 'USD price')}
                                        onChange={(e) =>
                                            setRows((prev) =>
                                                prev.map((p, j) =>
                                                    j === i
                                                        ? {
                                                              ...p,
                                                              price_usd: Number(e.target.value),
                                                          }
                                                        : p
                                                )
                                            )
                                        }
                                        className="w-28 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                                    />
                                </label>
                            </div>
                        ))}
                        <label className="flex items-center gap-2 text-xs text-text-muted">
                            {t('成本保护下限 ¥', 'Cost-protection floor ¥')}
                            <input
                                type="number"
                                min={0}
                                value={floor}
                                onChange={(e) => setFloor(e.target.value)}
                                className="w-28 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => void onSave()}
                            disabled={saving || rows.length === 0}
                            className="fs-btn fs-btn-primary text-xs disabled:opacity-50"
                        >
                            {t('保存新版本', 'Save as new version')}
                        </button>
                    </div>
                )}
            </section>

            <section>
                <h2 className="mb-2 text-sm font-medium text-text-primary">
                    {t('版本历史', 'Version history')}
                </h2>
                {book && book.versions.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-border">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-bg-muted text-xs text-text-muted">
                                <tr>
                                    <th className="px-3 py-2">{t('版本', 'Version')}</th>
                                    <th className="px-3 py-2">{t('状态', 'Status')}</th>
                                    <th className="px-3 py-2">{t('下限', 'Floor')}</th>
                                    <th className="px-3 py-2">{t('条目', 'Entries')}</th>
                                    <th className="px-3 py-2">{t('创建人', 'Created by')}</th>
                                    <th className="px-3 py-2">{t('时间', 'Created at')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {book.versions.map((v) => (
                                    <tr
                                        key={v.id}
                                        className="border-t border-border text-text-primary"
                                    >
                                        <td className="px-3 py-2">v{v.version}</td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[11px] ${
                                                    v.status === 'active'
                                                        ? 'bg-success/10 text-success'
                                                        : 'bg-bg-muted text-text-secondary'
                                                }`}
                                            >
                                                {v.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            ¥{v.cost_protection_floor_cny}
                                        </td>
                                        <td className="px-3 py-2">{v.prices.length}</td>
                                        <td className="px-3 py-2 text-xs text-text-muted">
                                            {v.created_by}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-text-muted">
                                            {v.created_at}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-xs text-text-muted">{t('暂无版本', 'No versions')}</p>
                )}
            </section>
        </div>
    );
}

const EMPTY_DRAFT: DiscountDraft = {
    kind: 'promo',
    code: '',
    label: '',
    percent_off: 0,
    min_spend_cny: 0,
    max_uses: 0,
    stackable_with: [],
};

function DiscountsTab() {
    const [state, setState] = useState<LoadState>('loading');
    const [rules, setRules] = useState<DiscountRule[]>([]);
    const [draft, setDraft] = useState<DiscountDraft>({ ...EMPTY_DRAFT });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        setState('loading');
        try {
            setRules(await fetchDiscounts());
            setState('ready');
        } catch (err) {
            console.warn('[factoryOps] discounts load failed:', err);
            setError(err instanceof Error ? err.message : String(err));
            setState('error');
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const onCreate = async () => {
        setBusy(true);
        try {
            await createDiscount(draft);
            pushToast('success', t('折扣规则已创建', 'Discount rule created'));
            setDraft({ ...EMPTY_DRAFT });
            await reload();
        } catch (err) {
            console.warn('[factoryOps] discount create failed:', err);
            const detail = err instanceof Error ? err.message : String(err);
            pushToast('error', `${t('创建失败', 'Create failed')}: ${detail}`);
        } finally {
            setBusy(false);
        }
    };

    const onToggle = async (rule: DiscountRule) => {
        try {
            await toggleDiscount(rule.id, !rule.active);
            setRules((prev) =>
                prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r))
            );
        } catch (err) {
            console.warn('[factoryOps] discount toggle failed:', rule.id, err);
            pushToast('error', t('切换失败', 'Toggle failed'));
        }
    };

    if (state === 'error') {
        return (
            <div className="rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <Tag size={15} aria-hidden className="text-text-muted" />
                    {t('折扣规则', 'Discount rules')}
                </h2>
                {rules.length === 0 ? (
                    <div className="mt-3">
                        <EmptyState
                            title={t('暂无规则', 'No rules')}
                            description={t(
                                '用下方表单创建第一条折扣规则。',
                                'Create the first rule with the form below.'
                            )}
                        />
                    </div>
                ) : (
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-bg-muted text-xs text-text-muted">
                                <tr>
                                    <th className="px-3 py-2">{t('类型', 'Kind')}</th>
                                    <th className="px-3 py-2">{t('码/名称', 'Code/Label')}</th>
                                    <th className="px-3 py-2">{t('折扣', 'Percent')}</th>
                                    <th className="px-3 py-2">{t('门槛 ¥', 'Min spend ¥')}</th>
                                    <th className="px-3 py-2">{t('次数', 'Uses')}</th>
                                    <th className="px-3 py-2">{t('可叠加', 'Stackable with')}</th>
                                    <th className="px-3 py-2">{t('启用', 'Active')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="border-t border-border text-text-primary"
                                    >
                                        <td className="px-3 py-2 text-xs">{r.kind}</td>
                                        <td className="px-3 py-2 text-xs">
                                            {r.code ? <b>{r.code}</b> : null} {r.label}
                                        </td>
                                        <td className="px-3 py-2">{r.percent_off}%</td>
                                        <td className="px-3 py-2">¥{r.min_spend_cny}</td>
                                        <td className="px-3 py-2">
                                            {r.used_count}/{r.max_uses || '∞'}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-text-muted">
                                            {r.stackable_with.length > 0
                                                ? r.stackable_with.join(', ')
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => void onToggle(r)}
                                                role="switch"
                                                aria-checked={r.active}
                                                aria-label={`${r.code || r.label} active`}
                                                className={`h-5 w-9 rounded-full transition-colors ${
                                                    r.active ? 'bg-success' : 'bg-bg-muted'
                                                }`}
                                            >
                                                <span
                                                    className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                                        r.active
                                                            ? 'translate-x-4'
                                                            : 'translate-x-0.5'
                                                    }`}
                                                />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
                <h2 className="text-sm font-medium text-text-primary">
                    {t('新建规则', 'New rule')}
                </h2>
                <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                        {t('类型', 'Kind')}
                        <select
                            value={draft.kind}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    kind: e.target.value as DiscountDraft['kind'],
                                })
                            }
                            className="rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                        >
                            {DISCOUNT_KINDS.map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                        {t('促销码', 'Promo code')}
                        <input
                            type="text"
                            value={draft.code}
                            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                            className="w-28 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                        {t('名称', 'Label')}
                        <input
                            type="text"
                            value={draft.label}
                            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                            className="w-40 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                        {t('折扣 %', 'Percent off')}
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={draft.percent_off}
                            onChange={(e) =>
                                setDraft({ ...draft, percent_off: Number(e.target.value) })
                            }
                            className="w-20 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                        {t('门槛 ¥', 'Min spend ¥')}
                        <input
                            type="number"
                            min={0}
                            value={draft.min_spend_cny}
                            onChange={(e) =>
                                setDraft({ ...draft, min_spend_cny: Number(e.target.value) })
                            }
                            className="w-24 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                        {t('最大次数 (0=∞)', 'Max uses (0=∞)')}
                        <input
                            type="number"
                            min={0}
                            value={draft.max_uses}
                            onChange={(e) =>
                                setDraft({ ...draft, max_uses: Number(e.target.value) })
                            }
                            className="w-24 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-primary"
                        />
                    </label>
                </div>
                <fieldset className="mt-3">
                    <legend className="text-xs text-text-muted">
                        {t('可叠加类型', 'Stackable with kinds')}
                    </legend>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-secondary">
                        {DISCOUNT_KINDS.map((k) => (
                            <label key={k} className="flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={draft.stackable_with.includes(k)}
                                    onChange={(e) =>
                                        setDraft((prev) => ({
                                            ...prev,
                                            stackable_with: e.target.checked
                                                ? [...prev.stackable_with, k]
                                                : prev.stackable_with.filter((x) => x !== k),
                                        }))
                                    }
                                />
                                {k}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <button
                    type="button"
                    onClick={() => void onCreate()}
                    disabled={busy || draft.percent_off <= 0}
                    className="mt-4 fs-btn fs-btn-primary text-xs disabled:opacity-50"
                >
                    {t('创建规则', 'Create rule')}
                </button>
                {state === 'loading' ? (
                    <p className="mt-2 text-xs text-text-muted">{t('加载中…', 'Loading…')}</p>
                ) : null}
            </section>
        </div>
    );
}
