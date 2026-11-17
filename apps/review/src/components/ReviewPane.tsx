import { EmptyState, Shell } from '@/components/PendingList';
import type { ReviewRpc } from '@/lib/api';
import {
    type Anchor,
    type CommentDraft,
    type Verdict,
    aggregateVerdict,
    closeDraft,
    openDraft,
    serialize,
    updateDraft,
} from '@/lib/capture';
import { type DiffFile, parseUnifiedDiff } from '@/lib/diff';
import { type PlanStep, type PlanView, planView } from '@/lib/plan';
import { ArrowLeft, Plus, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface Props {
    rpc: ReviewRpc;
    planId: string;
    onBack(): void;
    onSubmitted(): void;
}

/** Review pane (issue #163): render plan steps (or the plan's diff artifact)
 *  with line/step anchors, capture anchored comments, submit the structured
 *  review round-trip. */
export function ReviewPane({ rpc, planId, onBack, onSubmitted }: Props): JSX.Element {
    const [plan, setPlan] = useState<PlanView | null>(null);
    const [files, setFiles] = useState<DiffFile[]>([]);
    const [drafts, setDrafts] = useState<CommentDraft[]>([]);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        let alive = true;
        setState('loading');
        rpc.getPlan(planId)
            .then((raw) => {
                if (!alive) return;
                const v = planView(raw);
                setPlan(v);
                // Diff artifact rides plan metadata when the agent attached one.
                const meta = (raw.metadata ?? {}) as Record<string, unknown>;
                const diffText = typeof meta.diff === 'string' ? meta.diff : '';
                setFiles(diffText ? parseUnifiedDiff(diffText) : []);
                setState('ready');
            })
            .catch((err: Error) => {
                if (!alive) return;
                console.error('[review] plan load failed', err);
                setError(err.message);
                setState('error');
            });
        return () => {
            alive = false;
        };
    }, [rpc, planId]);

    const comments = useMemo(() => serialize(drafts), [drafts]);
    const verdict: Verdict = useMemo(() => aggregateVerdict(comments), [comments]);

    async function submit(): Promise<void> {
        if (!plan || submitting) return;
        setSubmitting(true);
        try {
            const r = await rpc.submitPlanReview(
                plan.planId,
                comments,
                comments.length > 0 ? verdict : 'approve'
            );
            console.log('[review] submitted', plan.planId, r);
            setToast(
                r.approved
                    ? '已批准 / approved'
                    : '反馈已回传，计划保持待改 / review sent, plan stays pending'
            );
            onSubmitted();
        } catch (err) {
            console.error('[review] submit failed', err);
            setToast(`提交失败 / submit failed: ${(err as Error).message}`);
        } finally {
            setSubmitting(false);
        }
    }

    if (state === 'error') {
        return (
            <Shell>
                <BackBar onBack={onBack} title={planId} />
                <EmptyState icon={Send} title="无法加载计划 / Cannot load plan" detail={error} />
            </Shell>
        );
    }
    if (state === 'loading' || !plan) {
        return (
            <Shell>
                <BackBar onBack={onBack} title={planId} />
                <div
                    className="h-40 animate-pulse rounded-xl border border-border bg-bg-muted"
                    aria-busy="true"
                />
            </Shell>
        );
    }

    return (
        <Shell>
            <BackBar onBack={onBack} title={plan.title} />
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span className="rounded-full bg-bg-muted px-2 py-0.5">{plan.planId}</span>
                <span className="rounded-full bg-bg-muted px-2 py-0.5">status: {plan.status}</span>
                {plan.overallRisk ? (
                    <span className="rounded-full bg-bg-muted px-2 py-0.5">
                        risk: {plan.overallRisk}
                    </span>
                ) : null}
            </div>
            {plan.review ? (
                <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    已有评审 / existing review: {plan.review.verdict ?? '?'} ·{' '}
                    {plan.review.comments?.length ?? 0} 条 / comment(s)
                </div>
            ) : null}

            <section aria-label="plan steps" className="mb-4 space-y-1">
                {plan.steps.map((s) => (
                    <StepRow
                        key={s.anchor}
                        step={s}
                        drafts={drafts.filter((d) => d.anchor.id === s.anchor)}
                        onAnchor={() =>
                            setDrafts((d) => openDraft({ kind: 'line', id: s.anchor }, d))
                        }
                        onPatch={(key, patch) => setDrafts((d) => updateDraft(d, key, patch))}
                        onClose={(key) => setDrafts((d) => closeDraft(d, key))}
                    />
                ))}
            </section>

            {files.length > 0 ? (
                <section aria-label="diff" className="mb-4">
                    <h2 className="mb-1 text-xs uppercase tracking-wider text-text-muted">Diff</h2>
                    {files.map((f) => (
                        <div
                            key={f.path}
                            className="mb-3 overflow-hidden rounded-xl border border-border"
                        >
                            <div className="bg-bg-muted px-3 py-1.5 text-xs text-text-muted">
                                {f.path}
                            </div>
                            {f.hunks.map((h) => (
                                <div key={h.anchor}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setDrafts((d) =>
                                                openDraft({ kind: 'line', id: h.anchor }, d)
                                            )
                                        }
                                        className="block w-full bg-bg-elevated px-3 py-1 text-left font-mono text-[11px] text-text-muted hover:text-brand"
                                    >
                                        {h.header}
                                    </button>
                                    {h.lines.map((l, i) => {
                                        const anchorId = `${f.path}:${l.newLine ?? `old-${l.oldLine}`}`;
                                        const mine = drafts.filter((d) => d.anchor.id === anchorId);
                                        const tone =
                                            l.kind === 'add'
                                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                : l.kind === 'del'
                                                  ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                                                  : '';
                                        return (
                                            <div key={`${anchorId}-${i}`}>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDrafts((d) =>
                                                            openDraft(
                                                                { kind: 'line', id: anchorId },
                                                                d
                                                            )
                                                        )
                                                    }
                                                    className={`block w-full px-3 py-0.5 text-left font-mono text-xs hover:bg-brand/10 ${tone}`}
                                                >
                                                    <span className="mr-2 inline-block w-10 select-none text-right text-text-muted">
                                                        {l.newLine ?? '—'}
                                                    </span>
                                                    {l.text}
                                                </button>
                                                <DraftCards
                                                    drafts={mine}
                                                    onPatch={(key, patch) =>
                                                        setDrafts((d) => updateDraft(d, key, patch))
                                                    }
                                                    onClose={(key) =>
                                                        setDrafts((d) => closeDraft(d, key))
                                                    }
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            ) : null}

            <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-bg-base py-3">
                <span className="text-xs text-text-muted">
                    {comments.length} 条锚定评论 / anchored comment(s) · verdict: {verdict}
                </span>
                <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submit()}
                    className="ml-auto flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                >
                    <Send size={14} aria-hidden />
                    {submitting ? '提交中… / submitting…' : '提交评审 / Submit review'}
                </button>
            </div>
            {toast ? (
                <p role="status" className="mt-2 text-xs text-text-muted">
                    {toast}
                </p>
            ) : null}
        </Shell>
    );
}

function BackBar({ onBack, title }: { onBack(): void; title: string }): JSX.Element {
    return (
        <div className="mb-3 flex items-center gap-2">
            <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-muted hover:border-brand"
            >
                <ArrowLeft size={12} aria-hidden /> 返回 / Back
            </button>
            <h1 className="truncate text-base font-medium text-text-primary">{title}</h1>
        </div>
    );
}

function StepRow({
    step,
    drafts,
    onAnchor,
    onPatch,
    onClose,
}: {
    step: PlanStep;
    drafts: CommentDraft[];
    onAnchor(): void;
    onPatch(key: string, patch: { text?: string; verdict?: Verdict }): void;
    onClose(key: string): void;
}): JSX.Element {
    return (
        <div>
            <button
                type="button"
                onClick={onAnchor}
                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-bg-muted"
            >
                <span className="mt-0.5 shrink-0 font-mono text-xs text-text-muted">
                    {step.index}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm text-text-primary">{step.title}</span>
                    {step.detail ? (
                        <span className="block text-xs text-text-muted">{step.detail}</span>
                    ) : null}
                </span>
                {step.risk ? (
                    <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-muted">
                        {step.risk}
                    </span>
                ) : null}
                <Plus size={12} className="mt-1 shrink-0 text-text-muted" aria-hidden />
            </button>
            <DraftCards drafts={drafts} onPatch={onPatch} onClose={onClose} />
        </div>
    );
}

function DraftCards({
    drafts,
    onPatch,
    onClose,
}: {
    drafts: CommentDraft[];
    onPatch(key: string, patch: { text?: string; verdict?: Verdict }): void;
    onClose(key: string): void;
}): JSX.Element | null {
    if (drafts.length === 0) return null;
    return (
        <div className="ml-8 space-y-1 pb-1">
            {drafts.map((d) => (
                <div key={d.key} className="rounded-lg border border-border bg-bg-elevated p-2">
                    <div className="mb-1 flex items-center gap-1">
                        <code className="text-[11px] text-text-muted">{d.anchor.id}</code>
                        <select
                            value={d.verdict}
                            onChange={(e) => onPatch(d.key, { verdict: e.target.value as Verdict })}
                            className="ml-auto rounded border border-border bg-bg-base px-1 py-0.5 text-xs"
                            aria-label="verdict"
                        >
                            <option value="question">question</option>
                            <option value="request_changes">request changes</option>
                            <option value="approve">approve</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => onClose(d.key)}
                            className="rounded px-1 text-xs text-text-muted hover:text-red-500"
                            aria-label="remove comment"
                        >
                            ×
                        </button>
                    </div>
                    <textarea
                        value={d.text}
                        onChange={(e) => onPatch(d.key, { text: e.target.value })}
                        rows={2}
                        placeholder="评论 / comment…"
                        className="w-full rounded border border-border bg-bg-base px-2 py-1 text-xs text-text-primary"
                    />
                </div>
            ))}
        </div>
    );
}

export type { Anchor };
