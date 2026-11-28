import { pushToast } from '@/components/ToastHost';
import {
    type AbTelemetry,
    type DeliveryOrder,
    LEAD_STATUSES,
    type OpsLead,
    approveOpsLead,
    discardOpsLead,
    draftArms,
    fetchDeliveryOrders,
    fetchOpsCatalog,
    fetchOpsLeads,
    fetchOpsTelemetry,
    parseCatalogPrice,
    privacyRouting,
} from '@/lib/opsConsole';
import { useAuth } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import { EmptyState, ErrorState, MetricTile } from '@fusion/web-ui';
import { AlertTriangle, Cloud, Inbox, Lock, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Factory ops console (issue #197, plan §4.3): operator surface over the
 * cowork demand/delivery engine through the gateway shell proxy. Metrics
 * cards + lead inbox + dual-draft A/B detail + delivery rail. Zero mock
 * data (site#102 rule): every number comes from the engine endpoints and
 * is parsed defensively (opsConsole.ts). Admin-role gated; polling refresh
 * until the engine ships an SSE/outbox surface (plan ruling A1 fallback).
 */

type LoadState = 'loading' | 'ready' | 'error';
type ConsoleTab = 'leads' | 'delivery';

const POLL_MS = 15000;

const STATUS_CHIP: Record<string, string> = {
    normalized: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    parked: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    matched: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    drafted: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    discarded: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
    spam: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
    duplicate: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
};

function fmtCny(v: number): string {
    return `¥${v.toLocaleString('zh-CN')}`;
}

function fmtSec(v: number | null): string {
    return v === null ? '—' : `${v.toFixed(1)}s`;
}

function fmtTime(unix: number): string {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleString();
}

export function OpsConsolePage() {
    useLang((l) => l.lang);
    const me = useAuth((s) => s.user);
    const [tab, setTab] = useState<ConsoleTab>('leads');
    const [state, setState] = useState<LoadState>('loading');
    const [error, setError] = useState<string | null>(null);
    const [leads, setLeads] = useState<OpsLead[]>([]);
    const [orders, setOrders] = useState<DeliveryOrder[]>([]);
    const [telemetry, setTelemetry] = useState<AbTelemetry | null>(null);
    const [catalog, setCatalog] = useState<unknown>(null);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const reload = useRef(false);

    const isAdmin = Boolean(me && (me.roles.includes('admin') || me.permissions.includes('*')));

    const load = useCallback(async (statusFilterValue: string) => {
        if (reload.current) return;
        reload.current = true;
        try {
            const [leadRows, orderRows, ab] = await Promise.all([
                fetchOpsLeads(statusFilterValue),
                fetchDeliveryOrders(),
                fetchOpsTelemetry(),
            ]);
            setLeads(leadRows);
            setOrders(orderRows);
            setTelemetry(ab);
            setState('ready');
            setError(null);
        } catch (err) {
            console.warn('[ops-console] load failed', err);
            setError(err instanceof Error ? err.message : 'load failed');
            setState('error');
        } finally {
            reload.current = false;
        }
    }, []);

    useEffect(() => {
        if (!isAdmin) return;
        void load(statusFilter);
        fetchOpsCatalog()
            .then(setCatalog)
            .catch((err) => console.warn('[ops-console] catalog load failed', err));
        // Polling fallback (ruling A1): no demand/delivery SSE surface yet.
        const timer = window.setInterval(() => void load(statusFilter), POLL_MS);
        return () => window.clearInterval(timer);
    }, [isAdmin, load, statusFilter]);

    if (me && !isAdmin) {
        return (
            <div className="p-8">
                <ErrorState
                    message={t(
                        '403 需要管理员角色 — 运营台仅对管理员开放，如需访问请联系租户管理员。',
                        '403 Admin role required — the ops console is restricted to the admin role. Contact your tenant admin for access.'
                    )}
                />
            </div>
        );
    }

    const selected = leads.find((l) => l.id === selectedId) ?? null;

    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-4" data-testid="ops-console">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-text-primary">
                        {t('软件工厂运营台', 'Software Factory Ops Console')}
                    </h1>
                    <p className="text-xs text-text-secondary">
                        {t(
                            'demand 引擎 + 交付轨真实数据 · 15s 自动刷新',
                            'live demand engine + delivery rail · 15s auto refresh'
                        )}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void load(statusFilter)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary hover:border-brand"
                >
                    <RefreshCw size={14} aria-hidden />
                    {t('刷新', 'Refresh')}
                </button>
            </header>

            <MetricsRow leads={leads} orders={orders} telemetry={telemetry} />

            <nav className="flex gap-2" aria-label={t('运营台区块', 'Console sections')}>
                {(
                    [
                        [
                            'leads',
                            t('线索收件箱', 'Lead inbox'),
                            <Inbox key="i" size={14} aria-hidden />,
                        ],
                        [
                            'delivery',
                            t('交付轨', 'Delivery rail'),
                            <Truck key="t" size={14} aria-hidden />,
                        ],
                    ] as [ConsoleTab, string, JSX.Element][]
                ).map(([id, label, icon]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        aria-current={tab === id ? 'page' : undefined}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                            tab === id
                                ? 'border-brand/40 bg-brand/10 text-brand'
                                : 'border-border bg-bg-elevated text-text-primary hover:border-brand'
                        }`}
                    >
                        {icon}
                        {label}
                    </button>
                ))}
            </nav>

            {state === 'loading' && leads.length === 0 ? (
                <p className="py-16 text-center text-sm text-text-secondary">
                    {t('加载中…', 'Loading…')}
                </p>
            ) : state === 'error' ? (
                <ErrorState
                    message={`${t('加载失败', 'Failed to load')}: ${error ?? ''}`}
                    onRetry={() => void load(statusFilter)}
                />
            ) : tab === 'leads' ? (
                <LeadsView
                    leads={leads}
                    statusFilter={statusFilter}
                    onFilter={(s) => setStatusFilter(s)}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    selected={selected}
                    catalog={catalog}
                    onChanged={() => void load(statusFilter)}
                />
            ) : (
                <DeliveryRail orders={orders} />
            )}
        </div>
    );
}

function MetricsRow({
    leads,
    orders,
    telemetry,
}: {
    leads: OpsLead[];
    orders: DeliveryOrder[];
    telemetry: AbTelemetry | null;
}) {
    const m = computeClientMetrics(leads, orders);
    return (
        <section
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
            aria-label={t('指标卡', 'Metrics cards')}
        >
            <MetricTile label={t('新线索', 'New leads')} value={m.newLeads} />
            <MetricTile label={t('待双草稿', 'Pending dual-draft')} value={m.pendingDraft} />
            <MetricTile label={t('已报价', 'Quoted')} value={m.quoted} />
            <MetricTile label={t('交付中', 'In delivery')} value={m.inDelivery} />
            <MetricTile
                label={t('本月收入', 'Monthly revenue')}
                value={fmtCny(m.monthlyRevenueCny)}
            />
            {telemetry && telemetry.totalPicks > 0 ? (
                <p className="col-span-full text-xs text-text-secondary">
                    {t(
                        `A/B 遥测：本地选中率 ${(telemetry.pickRateLocal * 100).toFixed(0)}% · 云选中率 ${(telemetry.pickRateCloud * 100).toFixed(0)}% · 平均改写距离 ${telemetry.avgEditDistance}`,
                        `A/B telemetry: local pick rate ${(telemetry.pickRateLocal * 100).toFixed(0)}% · cloud pick rate ${(telemetry.pickRateCloud * 100).toFixed(0)}% · avg edit distance ${telemetry.avgEditDistance}`
                    )}
                </p>
            ) : null}
        </section>
    );
}

/** Same counting rules as computeConsoleMetrics (kept in sync via tests). */
function computeClientMetrics(leads: OpsLead[], orders: DeliveryOrder[]) {
    const now = Date.now();
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

function LeadsView({
    leads,
    statusFilter,
    onFilter,
    selectedId,
    onSelect,
    selected,
    catalog,
    onChanged,
}: {
    leads: OpsLead[];
    statusFilter: string;
    onFilter: (s: string) => void;
    selectedId: number | null;
    onSelect: (id: number | null) => void;
    selected: OpsLead | null;
    catalog: unknown;
    onChanged: () => void;
}) {
    if (leads.length === 0) {
        return (
            <EmptyState
                title={t('暂无线索', 'No leads')}
                description={t(
                    'demand 引擎当前没有匹配筛选状态的线索。',
                    'The demand engine has no leads matching the current filter.'
                )}
            />
        );
    }
    return (
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,32%)_1fr]">
            <section className="flex flex-col gap-2" aria-label={t('线索列表', 'Lead list')}>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                    {t('状态', 'Status')}
                    <select
                        value={statusFilter}
                        onChange={(e) => onFilter(e.target.value)}
                        className="rounded-lg border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary"
                    >
                        <option value="">{t('全部', 'All')}</option>
                        {LEAD_STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </label>
                <ul className="flex flex-col gap-2 overflow-y-auto">
                    {leads.map((l) => (
                        <li key={l.id}>
                            <button
                                type="button"
                                onClick={() => onSelect(l.id)}
                                aria-current={selectedId === l.id ? 'true' : undefined}
                                className={`w-full rounded-xl border px-3 py-2 text-left ${
                                    selectedId === l.id
                                        ? 'border-brand/40 bg-brand/10'
                                        : 'border-border bg-bg-elevated hover:border-brand'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium text-text-primary">
                                        {l.title || `#${l.id}`}
                                    </span>
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                                            STATUS_CHIP[l.status] ?? STATUS_CHIP.normalized
                                        }`}
                                    >
                                        {l.status}
                                    </span>
                                </div>
                                <p className="mt-1 flex items-center gap-2 text-[11px] text-text-secondary">
                                    <span>{l.source}</span>
                                    {l.matchedCapabilities.length > 0 ? (
                                        <span className="truncate">
                                            · {l.matchedCapabilities.join(', ')}
                                        </span>
                                    ) : null}
                                </p>
                            </button>
                        </li>
                    ))}
                </ul>
            </section>
            {selected ? (
                <LeadDetail lead={selected} catalog={catalog} onChanged={onChanged} />
            ) : (
                <EmptyState
                    title={t('选择一条线索', 'Select a lead')}
                    description={t(
                        '在左侧选择线索查看双草稿与报价。',
                        'Pick a lead to inspect its dual drafts and quote.'
                    )}
                />
            )}
        </div>
    );
}

function LeadDetail({
    lead,
    catalog,
    onChanged,
}: {
    lead: OpsLead;
    catalog: unknown;
    onChanged: () => void;
}) {
    const [pick, setPick] = useState<'a' | 'b' | null>(
        lead.draftPick === 'a' || lead.draftPick === 'b' ? (lead.draftPick as 'a' | 'b') : null
    );
    const [text, setText] = useState<string>(lead.draftFinal || '');
    const [busy, setBusy] = useState(false);
    const arms = draftArms(lead);
    const armA = arms[0] ?? null;
    const armB = arms[1] ?? null;
    const routing = privacyRouting(lead);
    const quoteRows = lead.matchedCapabilities
        .map((id) => parseCatalogPrice(catalog, id))
        .filter((r): r is NonNullable<typeof r> => r !== null);
    const quoteTotal = quoteRows.reduce((sum, r) => sum + r.priceCny, 0);

    useEffect(() => {
        setPick(
            lead.draftPick === 'a' || lead.draftPick === 'b' ? (lead.draftPick as 'a' | 'b') : null
        );
        setText(lead.draftFinal || '');
    }, [lead]);

    const approve = async () => {
        if (!pick) return;
        setBusy(true);
        const res = await approveOpsLead(lead.id, pick, text);
        setBusy(false);
        if (res.ok) {
            pushToast('success', t('已审批', 'Approved'));
            onChanged();
        } else if (res.status === 409) {
            pushToast('error', t('仅 drafted 状态可审批', 'Only drafted leads can be approved'));
        } else {
            pushToast('error', `${t('审批失败', 'Approve failed')}: ${res.detail}`);
        }
    };

    const discard = async () => {
        setBusy(true);
        const res = await discardOpsLead(lead.id, t('运营台弃单', 'Discarded from ops console'));
        setBusy(false);
        if (res.ok) {
            pushToast('success', t('已弃单', 'Discarded'));
            onChanged();
        } else {
            pushToast('error', `${t('弃单失败', 'Discard failed')}: ${res.detail}`);
        }
    };

    return (
        <section
            className="flex flex-col gap-4 overflow-y-auto"
            aria-label={t('工单详情', 'Order detail')}
        >
            <div className="rounded-xl border border-border bg-bg-elevated p-4">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h2 className="text-base font-semibold text-text-primary">{lead.title}</h2>
                        <p className="mt-0.5 text-xs text-text-secondary">
                            #{lead.id} · {lead.source} · {fmtTime(lead.arrivedAt)}
                        </p>
                    </div>
                    <PrivacyBadge routing={routing} />
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
                    {lead.description}
                </p>
                {lead.matchScore > 0 ? (
                    <p className="mt-2 text-xs text-text-secondary">
                        {t('匹配分', 'Match score')} {lead.matchScore} · {lead.matchReason}
                    </p>
                ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {arms.map((arm) => (
                    <DraftCard
                        key={arm.slot}
                        arm={arm}
                        selected={pick === arm.slot}
                        disabled={lead.status !== 'drafted'}
                        onPick={() => setPick(arm.slot)}
                    />
                ))}
            </div>

            {pick ? (
                <div className="rounded-xl border border-border bg-bg-elevated p-4">
                    <label className="text-xs text-text-secondary" htmlFor="ops-final-text">
                        {t('审批前编辑', 'Edit before approve')}
                    </label>
                    <textarea
                        id="ops-final-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={6}
                        placeholder={t(
                            '可编辑所选草稿后审批',
                            'Edit the picked draft before approving'
                        )}
                        className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                    />
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-border bg-bg-elevated p-4">
                    <h3 className="text-sm font-medium text-text-primary">
                        {t('报价卡', 'Quote')}
                    </h3>
                    {quoteRows.length === 0 ? (
                        <p className="mt-2 text-xs text-text-secondary">
                            {t('无能力目录匹配', 'No capability-catalog match')}
                        </p>
                    ) : (
                        <ul className="mt-2 flex flex-col gap-1 text-sm text-text-primary">
                            {quoteRows.map((r) => (
                                <li key={r.id} className="flex justify-between">
                                    <span>
                                        {r.nameZh} / {r.nameEn}
                                    </span>
                                    <span>{fmtCny(r.priceCny)}</span>
                                </li>
                            ))}
                            <li className="flex justify-between border-t border-border pt-1 font-medium">
                                <span>{t('合计', 'Total')}</span>
                                <span>{fmtCny(quoteTotal)}</span>
                            </li>
                        </ul>
                    )}
                    {lead.budgetHint ? (
                        <p className="mt-2 text-xs text-text-secondary">
                            {t('客户预算提示', 'Client budget hint')}: {lead.budgetHint}
                        </p>
                    ) : null}
                </div>

                <div className="rounded-xl border border-border bg-bg-elevated p-4">
                    <h3 className="text-sm font-medium text-text-primary">
                        {t('当日双线成本', 'Dual-line cost')}
                    </h3>
                    <ul className="mt-2 flex flex-col gap-1 text-sm text-text-primary">
                        <li className="flex justify-between">
                            <span>{t('A 线生成时长', 'Line A generation duration')}</span>
                            <span>{fmtSec(armA?.latencySec ?? null)}</span>
                        </li>
                        <li className="flex justify-between">
                            <span>{t('B 线生成时长', 'Line B generation duration')}</span>
                            <span>{fmtSec(armB?.latencySec ?? null)}</span>
                        </li>
                        {lead.editDistance >= 0 ? (
                            <li className="flex justify-between">
                                <span>{t('人工改写距离', 'Human edit distance')}</span>
                                <span>{lead.editDistance}</span>
                            </li>
                        ) : null}
                    </ul>
                    <p className="mt-2 text-[11px] text-text-secondary">
                        {t(
                            '时长来自引擎实测；token 计量线由 harness funnels 记账（接入后展示）。',
                            'Durations are engine-measured; the token metering line is booked by harness funnels (shown once wired).'
                        )}
                    </p>
                </div>
            </div>

            {lead.status === 'drafted' ? (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={!pick || busy}
                        onClick={() => void approve()}
                        className="rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {t('审批', 'Approve')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void discard()}
                        className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:border-brand"
                    >
                        {t('弃单', 'Discard')}
                    </button>
                </div>
            ) : (
                <p className="text-xs text-text-secondary">
                    {t('当前状态', 'Current status')}: {lead.status}
                    {lead.draftPick
                        ? ` · ${t('已选', 'picked')} ${lead.draftPick.toUpperCase()}`
                        : ''}
                    {lead.editDistance >= 0
                        ? ` · ${t('改写距离', 'edit distance')} ${lead.editDistance}`
                        : ''}
                </p>
            )}
        </section>
    );
}

function PrivacyBadge({ routing }: { routing: 'local' | 'cloud' | 'undecided' }) {
    if (routing === 'local') {
        return (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <ShieldCheck size={13} aria-hidden />
                {t('仅本地模型', 'Local-only')}
            </span>
        );
    }
    if (routing === 'cloud') {
        return (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <AlertTriangle size={13} aria-hidden />
                {t('数据已出内网（云）', 'Cloud-touched data')}
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <Lock size={13} aria-hidden />
            {t('未选择路由', 'Routing undecided')}
        </span>
    );
}

function DraftCard({
    arm,
    selected,
    disabled,
    onPick,
}: {
    arm: {
        slot: 'a' | 'b';
        model: string;
        latencySec: number | null;
        charCount: number;
        text: string;
    };
    selected: boolean;
    disabled: boolean;
    onPick: () => void;
}) {
    const isCloud = arm.slot === 'b';
    return (
        <div
            className={`rounded-xl border p-4 ${
                selected ? 'border-brand/60 bg-brand/5' : 'border-border bg-bg-elevated'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                    {isCloud ? (
                        <Cloud size={14} aria-hidden />
                    ) : (
                        <ShieldCheck size={14} aria-hidden />
                    )}
                    {isCloud
                        ? t('B 线 · 云', 'Line B · cloud')
                        : t('A 线 · 本地', 'Line A · local')}
                    <span className="text-xs font-normal text-text-secondary">{arm.model}</span>
                </h3>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onPick}
                    aria-pressed={selected}
                    className={`rounded-lg border px-3 py-1 text-xs ${
                        selected
                            ? 'border-brand bg-brand text-white'
                            : 'border-border text-text-primary hover:border-brand'
                    } disabled:opacity-40`}
                >
                    {t('选择', 'Pick')}
                </button>
            </div>
            <dl className="mt-2 flex gap-4 text-xs text-text-secondary">
                <div>
                    <dt className="inline">{t('用时', 'Duration')} </dt>
                    <dd className="inline text-text-primary">{fmtSec(arm.latencySec)}</dd>
                </div>
                <div>
                    <dt className="inline">{t('字数', 'Chars')} </dt>
                    <dd className="inline text-text-primary">{arm.charCount}</dd>
                </div>
            </dl>
            <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-text-primary">
                {arm.text ||
                    t(
                        '（该线生成失败，见引擎错误记录）',
                        '(this arm failed; see engine error notes)'
                    )}
            </p>
        </div>
    );
}

function DeliveryRail({ orders }: { orders: DeliveryOrder[] }) {
    if (orders.length === 0) {
        return (
            <EmptyState
                title={t('暂无交付订单', 'No delivery orders')}
                description={t(
                    '交付轨当前为空。审批线索后订单在此出现。',
                    'The delivery rail is empty. Approved leads appear here as orders.'
                )}
            />
        );
    }
    return (
        <section className="flex flex-col gap-2" aria-label={t('交付轨', 'Delivery rail')}>
            {orders.map((o) => (
                <div
                    key={o.orderNo}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3"
                >
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                            {o.title || o.orderNo}
                        </p>
                        <p className="text-xs text-text-secondary">
                            {o.orderNo} · {o.capability} · {t('阶段', 'stage')} {o.stage} ·{' '}
                            {fmtTime(o.createdAt)}
                        </p>
                    </div>
                    <span className="shrink-0 text-sm text-text-primary">{fmtCny(o.priceCny)}</span>
                </div>
            ))}
        </section>
    );
}
