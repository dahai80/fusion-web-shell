import type { ReviewRpc } from '@/lib/api';
import { type PlanView, planView } from '@/lib/plan';
import { ClipboardList, FileDiff, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
    rpc: ReviewRpc;
    reload: number;
    onOpen(planId: string): void;
}

/** Pending review queue (issue #163): plans + HiTL inputs from the
 *  agent-studio bridge. Triage ordering lands with #730 review.triage. */
export function PendingList({ rpc, reload, onOpen }: Props): null | JSX.Element {
    const [plans, setPlans] = useState<PlanView[]>([]);
    const [inputs, setInputs] = useState<number>(0);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const [refresh, setRefresh] = useState(0);

    // biome-ignore lint/correctness/useExhaustiveDependencies: reload/refresh are reload triggers, read only as deps
    useEffect(() => {
        let alive = true;
        setState('loading');
        rpc.pendingQueue()
            .then(({ plans: raw, inputs: hitl }) => {
                if (!alive) return;
                // Pending plans only; decided (approved/done) plans are
                // hidden — the queue is for action.
                const views = raw
                    .map((p) => planView(p))
                    .filter(
                        (v) =>
                            v.status !== 'approved' &&
                            v.status !== 'completed' &&
                            v.status !== 'done'
                    )
                    .sort((a, b) => a.planId.localeCompare(b.planId));
                setPlans(views);
                setInputs(hitl.length);
                setState('ready');
            })
            .catch((err: Error) => {
                if (!alive) return;
                console.error('[review] queue load failed', err);
                setMessage(err.message);
                setState('error');
            });
        return () => {
            alive = false;
        };
    }, [rpc, reload, refresh]);

    if (state === 'error') {
        return (
            <Shell>
                <EmptyState
                    icon={ClipboardList}
                    title="无法加载待审队列 / Cannot load queue"
                    detail={message}
                />
            </Shell>
        );
    }
    return (
        <Shell>
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-base font-medium text-text-primary">待审 / Review queue</h1>
                <button
                    type="button"
                    onClick={() => setRefresh((n) => n + 1)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-muted hover:border-brand"
                >
                    <RefreshCw size={12} aria-hidden /> 刷新 / Refresh
                </button>
            </div>
            {state === 'loading' ? (
                <div className="space-y-2" aria-busy="true">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            ) : (
                <div className="space-y-2">
                    {inputs > 0 ? (
                        <div className="rounded-xl border border-border bg-bg-elevated px-3 py-2 text-xs text-text-muted">
                            {inputs} 个 HiTL 输入等待响应 / {inputs} HiTL input(s) awaiting response
                            (respond via session chat)
                        </div>
                    ) : null}
                    {plans.length === 0 ? (
                        <EmptyState
                            icon={ClipboardList}
                            title="队列为空 / Queue empty"
                            detail="没有待审计划 / No plans pending review"
                        />
                    ) : (
                        plans.map((p) => (
                            <button
                                key={p.planId}
                                type="button"
                                onClick={() => onOpen(p.planId)}
                                className="flex w-full items-center gap-3 rounded-xl border border-border bg-bg-elevated px-3 py-2.5 text-left hover:border-brand"
                            >
                                <FileDiff size={16} className="shrink-0 text-brand" aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm text-text-primary">
                                        {p.title}
                                    </span>
                                    <span className="block truncate text-xs text-text-muted">
                                        {p.planId} · {p.steps.length} 步 / steps
                                        {p.overallRisk ? ` · risk ${p.overallRisk}` : ''}
                                        {p.review
                                            ? ` · 已有反馈 / reviewed (${p.review.verdict ?? '?'})`
                                            : ''}
                                    </span>
                                </span>
                                {p.status === 'changes_requested' ? (
                                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                                        待修改 / changes
                                    </span>
                                ) : null}
                            </button>
                        ))
                    )}
                </div>
            )}
        </Shell>
    );
}

function SkeletonRow(): JSX.Element {
    return <div className="h-12 animate-pulse rounded-xl border border-border bg-bg-muted" />;
}

export function EmptyState({
    icon: Icon,
    title,
    detail,
}: {
    icon: typeof ClipboardList;
    title: string;
    detail?: string;
}): JSX.Element {
    return (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon size={28} className="text-text-muted" aria-hidden />
            <p className="text-sm text-text-primary">{title}</p>
            {detail ? <p className="max-w-md text-xs text-text-muted">{detail}</p> : null}
        </div>
    );
}

export function Shell({ children }: { children: React.ReactNode }): JSX.Element {
    return <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>;
}
