import {
    type AgentCardStatus,
    type CoworkRun,
    type DerivedAgentCard,
    deriveCards,
    deriveStats,
    deriveWaterfall,
    fetchPending,
    fetchRunDetail,
    fetchRuns,
    fetchStudioAgents,
    statusFromRun,
} from '@/lib/agentsApi';
import { type SseStreamHandle, openSseStream } from '@/lib/sseStream';
import { useAuth } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Agents overview dashboard (issue #137): first-class shell page giving a
 * fleet-level view over cowork workflows + agent-studio seats — stats row,
 * HITL banner, status cards, live SSE step feed for the selected run, and a
 * run pipeline waterfall. Consumes existing gateway surfaces only
 * (/shell/<module-id>/...); RBAC/theme/lang follow the shell.
 */

const RUNS_POLL_MS = 5000;
const MAX_FEED_LINES = 200;
const MAX_CARDS = 12;

interface FeedLine {
    ts: string;
    level: 'step' | 'good' | 'warn' | 'err' | 'info';
    text: string;
}

const DOT_CLS: Record<AgentCardStatus, string> = {
    run: 'bg-success animate-pulse',
    wait: 'bg-warning animate-pulse',
    idle: 'bg-border',
    err: 'bg-error',
};

const STATUS_LABEL: Record<AgentCardStatus, { zh: string; en: string }> = {
    run: { zh: '运行中', en: 'Running' },
    wait: { zh: '等待审批', en: 'Awaiting approval' },
    idle: { zh: '空闲', en: 'Idle' },
    err: { zh: '异常', en: 'Failed' },
};

function parseSseData(data: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(data) as unknown;
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/** Map one SSE frame to a feed line; unknown shapes become info lines. */
export function frameToFeedLine(frame: { event: string; data: string }): FeedLine | null {
    if (frame.event === 'ping') return null;
    const obj = parseSseData(frame.data);
    if (!obj) return null;
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const status = typeof obj.status === 'string' ? obj.status : '';
    const text =
        typeof obj.message === 'string'
            ? obj.message
            : typeof obj.summary === 'string'
              ? obj.summary
              : frame.event === 'snapshot'
                ? t('已连接事件流', 'Event stream connected')
                : `${frame.event}: ${status || 'update'}`;
    const level: FeedLine['level'] =
        status === 'success' || status === 'completed'
            ? 'good'
            : status === 'failed' || status === 'error'
              ? 'err'
              : status === 'pending_review' || status === 'waiting_approval'
                ? 'warn'
                : 'step';
    return { ts, level, text };
}

const LEVEL_CLS: Record<FeedLine['level'], string> = {
    step: 'text-brand',
    good: 'text-success',
    warn: 'text-warning',
    err: 'text-error',
    info: 'text-text-muted',
};

const LEVEL_MARK: Record<FeedLine['level'], string> = {
    step: '▸',
    good: '✓',
    warn: '△',
    err: '✕',
    info: '·',
};

function elapsedLabel(startedAt: string | null): string {
    if (!startedAt) return '—';
    const ts = Date.parse(startedAt);
    if (!Number.isFinite(ts)) return '—';
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h${mins % 60}m`;
}

function AgentCard({
    card,
    selected,
    onSelect,
}: {
    card: DerivedAgentCard;
    selected: boolean;
    onSelect(): void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={`rounded-2xl border bg-bg-elevated p-4 text-left shadow-sm transition-shadow hover:shadow-md ${
                selected ? 'border-brand shadow-[0_0_0_3px_rgba(79,70,229,0.15)]' : 'border-border'
            }`}
        >
            <div className="mb-2 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-base">
                    🤖
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text-primary">
                        {card.name}
                    </span>
                    <span className="block truncate text-[11px] text-text-muted">
                        {t(card.roleZh, card.roleEn)}
                    </span>
                </span>
                <span
                    className={`ml-auto h-2 w-2 shrink-0 rounded-full ${DOT_CLS[card.status]}`}
                    title={t(STATUS_LABEL[card.status].zh, STATUS_LABEL[card.status].en)}
                />
            </div>
            <div className="min-h-12 rounded-lg border border-border bg-bg-muted px-2.5 py-1.5 text-xs leading-relaxed text-text-secondary">
                {card.error
                    ? card.error
                    : card.runId
                      ? t(`当前 run ${card.runId}`, `Current run ${card.runId}`)
                      : t('空闲 — 无活动 run', 'Idle — no active run')}
            </div>
            <div className="mt-2 flex flex-wrap gap-2.5 text-[11px] text-text-muted">
                <span>
                    {t('工作流', 'Workflow')}{' '}
                    <b className="font-medium text-text-primary">{card.workflowName || '—'}</b>
                </span>
                <span>
                    {t('耗时', 'Elapsed')}{' '}
                    <b className="font-medium text-text-primary">{elapsedLabel(card.startedAt)}</b>
                </span>
            </div>
        </button>
    );
}

export function AgentsPage() {
    useLang((l) => l.lang);
    const token = useAuth((s) => s.token);
    const user = useAuth((s) => s.user);
    const [runs, setRuns] = useState<CoworkRun[]>([]);
    const [cards, setCards] = useState<DerivedAgentCard[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [feed, setFeed] = useState<FeedLine[]>([]);
    const [waterfall, setWaterfall] = useState<ReturnType<typeof deriveWaterfall>>([]);
    const [error, setError] = useState<string | null>(null);
    const sseRef = useRef<SseStreamHandle | null>(null);
    const feedBoxRef = useRef<HTMLDivElement | null>(null);

    const canView = user ? user.roles.includes('admin') || user.roles.includes('operator') : false;

    // HITL banner (issue #137): jump into the cowork module tab's approvals
    // surface — the same route notifications deep-links use.
    const openApprovals = useCallback(() => {
        const manifest = useManifests.getState().manifests.find((m) => m.id === 'fusion-cowork');
        if (!manifest) {
            console.warn('[agentsPage] cowork manifest missing, cannot open approvals');
            return;
        }
        useTabs.getState().openTab(manifest, { pageTitle: t('审批', 'Approvals') });
    }, []);

    const refresh = useCallback(async () => {
        try {
            const [runList, pending, studio] = await Promise.all([
                fetchRuns(),
                fetchPending().catch(() => ({ approvals: [] })),
                fetchStudioAgents().catch(() => []),
            ]);
            setRuns(runList);
            setPendingCount(pending.approvals.length);
            setCards(deriveCards(runList, studio).slice(0, MAX_CARDS));
            setError(null);
        } catch (err) {
            console.warn('[agentsPage] refresh failed:', err);
            setError((err as Error).message);
        }
    }, []);

    useEffect(() => {
        if (!token) return;
        void refresh();
        const timer = setInterval(() => void refresh(), RUNS_POLL_MS);
        return () => clearInterval(timer);
    }, [token, refresh]);

    // Select the freshest active run on first load; switching cards cancels
    // the old SSE subscription before opening the new one (issue #137).
    useEffect(() => {
        if (selectedRunId || runs.length === 0) return;
        const active = runs.find((r) => r.status === 'running') ?? runs[0];
        if (active) setSelectedRunId(active.run_id);
    }, [runs, selectedRunId]);

    useEffect(() => {
        if (!selectedRunId || !token) return;
        setFeed([]);
        sseRef.current?.close();
        sseRef.current = openSseStream(
            `/shell/fusion-cowork/api/runs/${selectedRunId}/events`,
            token,
            (frame) => {
                const line = frameToFeedLine(frame);
                if (line) setFeed((prev) => [...prev.slice(-MAX_FEED_LINES), line]);
            },
            () => {
                setFeed((prev) => [
                    ...prev,
                    {
                        ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                        level: 'err',
                        text: t(
                            '事件流中断，将随轮询恢复',
                            'Stream interrupted; polling continues'
                        ),
                    },
                ]);
            }
        );
        console.log('[agentsPage] subscribed to run:', selectedRunId);
        return () => {
            sseRef.current?.close();
            sseRef.current = null;
        };
    }, [selectedRunId, token]);

    // Waterfall tracks the selected run's detail; refreshed alongside polls.
    useEffect(() => {
        if (!selectedRunId) return;
        let alive = true;
        const load = async () => {
            try {
                const detail = await fetchRunDetail(selectedRunId);
                if (alive) setWaterfall(deriveWaterfall(detail));
            } catch (err) {
                console.warn('[agentsPage] run detail failed:', err);
            }
        };
        void load();
        const timer = setInterval(() => void load(), RUNS_POLL_MS);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [selectedRunId]);

    useEffect(() => {
        const box = feedBoxRef.current;
        if (box && feed.length > 0) box.scrollTop = box.scrollHeight;
    }, [feed.length]);

    const stats = deriveStats(runs);
    const selectedCard = cards.find((c) => c.runId === selectedRunId);
    const recentRuns = runs.slice(0, 8);

    if (user && !canView) {
        return (
            <div className="p-6 text-sm text-error">
                {t('需要管理员或运营者角色', 'Requires the admin or operator role')}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl p-4">
            <div className="mb-1 text-lg text-text-primary">
                {t('Agent 总览', 'Agent Overview')}
            </div>
            <div className="mb-4 text-xs text-text-muted">
                {t(
                    '全 fleet 视图：cowork 工作流 + agent-studio 座位。实时步骤流与管线水位来自 cowork run 事件。',
                    'Fleet view over cowork workflows + agent-studio seats. Live step feed and pipeline come from cowork run events.'
                )}
            </div>

            {error ? (
                <div className="mb-4 rounded-xl border border-error/40 bg-error/10 px-4 py-2 text-sm text-error">
                    {t('数据加载失败', 'Failed to load data')}: {error}
                </div>
            ) : null}

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                    [t('活跃 runs', 'Active runs'), String(stats.activeRuns)],
                    [t('等待人工', 'Waiting for human'), String(stats.waiting)],
                    [t('今日完成', 'Completed today'), String(stats.completedToday)],
                    [t('今日失败', 'Failed today'), String(stats.failed)],
                ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-border bg-bg-elevated p-3.5">
                        <div className="text-xs text-text-muted">{k}</div>
                        <div className="mt-1 text-2xl font-bold text-text-primary">{v}</div>
                    </div>
                ))}
            </div>

            {pendingCount > 0 ? (
                <button
                    type="button"
                    onClick={openApprovals}
                    className="mb-4 flex w-full items-center gap-2.5 rounded-xl border border-warning/60 bg-warning/10 px-4 py-2.5 text-left text-sm text-text-primary hover:bg-warning/15"
                >
                    {t(
                        `⚠ ${pendingCount} 个 agent 等待人工批准 — 点击进审批页`,
                        `⚠ ${pendingCount} agent(s) awaiting human approval — open approvals`
                    )}
                </button>
            ) : (
                <div className="mb-4 rounded-xl border border-border bg-bg-elevated px-4 py-2.5 text-sm text-text-muted">
                    {t('✓ 无等待项', '✓ Nothing waiting')}
                </div>
            )}

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {cards.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-bg-elevated p-6 text-sm text-text-muted md:col-span-3">
                        {t(
                            '暂无 agent 数据 — cowork 未运行或无权限',
                            'No agent data — cowork down or no access'
                        )}
                    </div>
                ) : (
                    cards.map((card) => (
                        <AgentCard
                            key={card.agentId}
                            card={card}
                            selected={card.runId === selectedRunId}
                            onSelect={() => card.runId && setSelectedRunId(card.runId)}
                        />
                    ))
                )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
                <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
                        {t('实时步骤流', 'Live step feed')}
                        <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                            SSE
                        </span>
                        {selectedCard ? (
                            <span className="text-xs font-normal text-text-muted">
                                · {selectedCard.name}
                            </span>
                        ) : null}
                    </div>
                    <div
                        ref={feedBoxRef}
                        className="h-72 overflow-y-auto rounded-xl border border-border bg-bg-muted p-3 font-mono text-xs leading-relaxed"
                    >
                        {feed.length === 0 ? (
                            <div className="text-text-muted">
                                {t('等待事件…', 'Waiting for events…')}
                            </div>
                        ) : (
                            feed.map((line, i) => (
                                <div key={`${line.ts}-${i}`} className="py-0.5">
                                    <span className="mr-2 text-text-muted">{line.ts}</span>
                                    <span className={`mr-1.5 ${LEVEL_CLS[line.level]}`}>
                                        {LEVEL_MARK[line.level]}
                                    </span>
                                    <span className="text-text-secondary">{line.text}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
                            {t('当前 run 管线水位', 'Run pipeline')}
                            <span className="font-mono text-[11px] font-normal text-text-muted">
                                {selectedRunId ?? '—'}
                            </span>
                        </div>
                        {waterfall.length === 0 ? (
                            <div className="text-xs text-text-muted">
                                {t('无节点数据', 'No node data')}
                            </div>
                        ) : (
                            waterfall.map((row) => (
                                <div
                                    key={row.nodeId}
                                    className="flex items-center gap-2 border-b border-dashed border-border py-1.5 text-xs last:border-b-0"
                                >
                                    <span className="w-12 shrink-0 font-mono text-[11px] text-text-muted">
                                        {row.nodeId}
                                    </span>
                                    <span className="w-24 shrink-0 truncate text-text-secondary">
                                        {row.label}
                                    </span>
                                    <span className="h-2 flex-1 overflow-hidden rounded-full border border-border bg-bg-muted">
                                        <span
                                            className={`block h-full rounded-full transition-all ${
                                                row.percent === 100 ? 'bg-success' : 'bg-brand'
                                            }`}
                                            style={{ width: `${row.percent}%` }}
                                        />
                                    </span>
                                    <span className="w-12 shrink-0 text-right font-mono text-[10px] text-text-muted">
                                        {row.durationSec !== null
                                            ? `${row.durationSec.toFixed(1)}s`
                                            : '—'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm">
                        <div className="mb-2 text-sm font-medium text-text-primary">
                            {t('最近 runs', 'Recent runs')}
                        </div>
                        {recentRuns.map((run) => (
                            <button
                                key={run.run_id}
                                type="button"
                                onClick={() => setSelectedRunId(run.run_id)}
                                className="flex w-full items-center gap-2 border-b border-dashed border-border py-1.5 text-xs last:border-b-0 hover:text-brand"
                            >
                                <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${
                                        run.status === 'success'
                                            ? 'bg-success'
                                            : DOT_CLS[statusFromRun(run)]
                                    }`}
                                />
                                <span className="truncate font-mono text-[10px] text-text-muted">
                                    {run.run_id}
                                </span>
                                <span className="truncate text-text-secondary">
                                    {run.workflow_name ?? run.workflow_id ?? '—'}
                                </span>
                                <span className="ml-auto shrink-0 text-[10px] text-text-muted">
                                    {run.status}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
