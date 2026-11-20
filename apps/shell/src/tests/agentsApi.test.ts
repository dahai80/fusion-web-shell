import { describe, expect, it } from 'bun:test';
import {
    type CoworkRun,
    type CoworkRunDetail,
    LIFECYCLE_LABEL,
    aggregateTokens,
    cardStatusFromLifecycle,
    deriveCards,
    deriveStats,
    deriveWaterfall,
    lifecycleFromCoworkRun,
    lifecycleFromStudioAgent,
    statusFromRun,
    tokensFromDetail,
} from '../lib/agentsApi';

const run = (over: Partial<CoworkRun>): CoworkRun => ({
    run_id: 'r1',
    workflow_id: 'product_lifecycle',
    workflow_name: 'product_lifecycle',
    status: 'running',
    ...over,
});

describe('statusFromRun (#137)', () => {
    it('running + no review = run (pulse)', () => {
        expect(statusFromRun({ status: 'running', review: undefined })).toBe('run');
    });

    it('running + pending review = wait', () => {
        expect(statusFromRun({ status: 'running', review: { status: 'pending_review' } })).toBe(
            'wait'
        );
    });

    it('failed / cancelled = err; success = idle (not a live card state)', () => {
        expect(statusFromRun({ status: 'failed' })).toBe('err');
        expect(statusFromRun({ status: 'cancelled' })).toBe('err');
        expect(statusFromRun({ status: 'success' })).toBe('idle');
    });
});

describe('deriveCards (#137)', () => {
    it('one card per workflow, newest run wins, studio agents appended idle', () => {
        const runs = [
            run({ run_id: 'r2', status: 'running' }),
            run({ run_id: 'r1', status: 'success' }),
            run({
                run_id: 'r3',
                workflow_id: 'coder_dispatch',
                status: 'running',
                review: { status: 'pending_review' },
            }),
        ];
        const cards = deriveCards(runs, [
            { agent_id: 'a1', name: 'delivery-ba', status: 'published' },
            { agent_id: 'a2', name: 'broken', status: 'error' },
        ]);
        expect(cards).toHaveLength(4);
        expect(cards[0]?.status).toBe('run'); // r2 wins (first = freshest)
        expect(cards[0]?.runId).toBe('r2');
        expect(cards[1]?.status).toBe('wait');
        expect(cards[2]?.agentId).toBe('studio:a1');
        expect(cards[2]?.status).toBe('idle');
        expect(cards[3]?.status).toBe('err');
    });
});

describe('deriveStats (#137)', () => {
    it('counts active / waiting / completed today / failed', () => {
        const now = Date.now();
        const runs = [
            run({ status: 'running' }),
            run({ status: 'running', review: { status: 'pending_review' } }),
            run({ status: 'failed' }),
            run({ status: 'success', finished_at: new Date(now - 3_600_000).toISOString() }),
            run({ status: 'success', finished_at: new Date(now - 3 * 86_400_000).toISOString() }),
        ];
        const s = deriveStats(runs, now);
        expect(s.activeRuns).toBe(1);
        expect(s.waiting).toBe(1);
        expect(s.completedToday).toBe(1);
        expect(s.failed).toBe(1);
    });
});

describe('deriveWaterfall (#137)', () => {
    it('done steps 100%, running 60%, pending 0%; label prefers display name', () => {
        const rows = deriveWaterfall({
            run_id: 'r1',
            status: 'running',
            steps: [
                {
                    node_id: 'n1',
                    node_name: 'ba',
                    node_display_name: 'PRD',
                    status: 'success',
                    execution_time: 12.34,
                },
                { node_id: 'n4m', node_name: 'historical_match', status: 'running' },
                { node_id: 'n5', status: 'pending' },
            ],
        });
        expect(rows[0]).toEqual({
            nodeId: 'n1',
            label: 'PRD',
            status: 'success',
            percent: 100,
            durationSec: 12.34,
        });
        expect(rows[1]?.percent).toBe(60);
        expect(rows[1]?.label).toBe('historical_match');
        expect(rows[2]?.percent).toBe(0);
        expect(rows[2]?.durationSec).toBeNull();
    });

    it('missing steps array yields empty waterfall', () => {
        expect(deriveWaterfall({ run_id: 'r1', status: 'running' })).toEqual([]);
    });
});

describe('aggregateTokens (#137 feedback)', () => {
    const now = Date.now();
    const todayRun = (id: string, wf: string): CoworkRun => ({
        run_id: id,
        workflow_id: wf,
        workflow_name: wf,
        status: 'success',
        created_at: now / 1000,
    });

    it('sums per-step tokens per workflow, sorted desc, skips old runs', () => {
        const runs = [
            todayRun('r1', 'wf_a'),
            todayRun('r2', 'wf_a'),
            todayRun('r3', 'wf_b'),
            { ...todayRun('r4', 'wf_a'), created_at: (now - 3 * 86_400_000) / 1000 },
        ];
        const details: Record<
            string,
            Parameters<typeof aggregateTokens>[1] extends (id: string) => infer R ? R : never
        > = {
            r1: {
                run_id: 'r1',
                status: 'success',
                steps: [
                    {
                        node_id: 'n1',
                        tokens: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
                    },
                    { node_id: 'n2', tokens: null },
                ],
            },
            r2: {
                run_id: 'r2',
                status: 'success',
                steps: [{ node_id: 'n1', tokens: { prompt_tokens: 50, completion_tokens: 30 } }],
            },
            r3: { run_id: 'r3', status: 'success', steps: [] },
        };
        const s = aggregateTokens(runs, (id) => details[id]);
        expect(s.total).toBe(200); // 120 + (50+30)
        expect(s.workflows).toHaveLength(2);
        expect(s.workflows[0]?.workflow).toBe('wf_a');
        expect(s.workflows[0]?.promptTokens).toBe(150);
        expect(s.workflows[0]?.completionTokens).toBe(50);
        expect(s.workflows[0]?.runs).toBe(2);
        expect(s.workflows[1]?.totalTokens).toBe(0);
    });

    it('missing details contribute nothing', () => {
        const s = aggregateTokens([todayRun('r9', 'wf_x')], () => undefined);
        expect(s.total).toBe(0);
        expect(s.workflows).toEqual([]);
    });
});

describe('unified run lifecycle (issue #177 R2)', () => {
    it('lifecycleFromCoworkRun maps the cowork status space', () => {
        expect(lifecycleFromCoworkRun(run({ status: 'queued' }))).toBe('queued');
        expect(lifecycleFromCoworkRun(run({ status: 'pending' }))).toBe('queued');
        expect(lifecycleFromCoworkRun(run({ status: 'running' }))).toBe('running');
        expect(
            lifecycleFromCoworkRun(run({ status: 'running', review: { status: 'pending_review' } }))
        ).toBe('awaiting_human');
        expect(lifecycleFromCoworkRun(run({ status: 'paused' }))).toBe('blocked');
        expect(lifecycleFromCoworkRun(run({ status: 'success' }))).toBe('done');
        expect(lifecycleFromCoworkRun(run({ status: 'failed' }))).toBe('error');
        expect(lifecycleFromCoworkRun(run({ status: 'cancelled' }))).toBe('error');
        expect(lifecycleFromCoworkRun(run({ status: 'who-knows' }))).toBe('queued');
    });
    it('lifecycleFromStudioAgent: published seats queue, dead seats error', () => {
        expect(lifecycleFromStudioAgent({ status: 'published' })).toBe('queued');
        expect(lifecycleFromStudioAgent({ status: undefined })).toBe('queued');
        expect(lifecycleFromStudioAgent({ status: 'disabled' })).toBe('error');
        expect(lifecycleFromStudioAgent({ status: 'archived' })).toBe('error');
    });
    it('statusFromRun stays consistent with the lifecycle mapping (one source)', () => {
        for (const status of ['queued', 'running', 'paused', 'success', 'failed']) {
            const r = run({ status });
            expect(statusFromRun(r)).toBe(cardStatusFromLifecycle(lifecycleFromCoworkRun(r)));
        }
        const r = run({ status: 'running', review: { status: 'pending_review' } });
        expect(statusFromRun(r)).toBe('wait');
    });
    it('LIFECYCLE_LABEL covers every lifecycle value bilingually', () => {
        for (const lc of [
            'queued',
            'running',
            'awaiting_human',
            'blocked',
            'done',
            'error',
        ] as const) {
            expect(LIFECYCLE_LABEL[lc].zh).toBeTruthy();
            expect(LIFECYCLE_LABEL[lc].en).toBeTruthy();
        }
    });
});

describe('card token accounting (issue #177 R2)', () => {
    const detail = (tokens: (Record<string, number> | null)[]): CoworkRunDetail => ({
        run_id: 'r1',
        status: 'running',
        steps: tokens.map((tk, i) => ({ node_id: `n${i}`, tokens: tk as never })),
    });
    it('tokensFromDetail sums steps; null when no usage at all', () => {
        const t = tokensFromDetail(
            detail([
                { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                null,
                { prompt_tokens: 1, completion_tokens: 1 },
            ])
        );
        expect(t).toEqual({ promptTokens: 11, completionTokens: 6, totalTokens: 17 });
        expect(tokensFromDetail(detail([null, null]))).toBeNull();
        expect(tokensFromDetail(undefined)).toBeNull();
    });
    it('deriveCards surfaces tokens for cowork cards, null for studio seats', () => {
        const cards = deriveCards(
            [run({ run_id: 'r1' })],
            [{ agent_id: 'a1', name: 'Seat', status: 'published' }],
            { r1: { promptTokens: 3, completionTokens: 4, totalTokens: 7 } }
        );
        expect(cards[0]!.tokens).toEqual({ promptTokens: 3, completionTokens: 4, totalTokens: 7 });
        expect(cards[0]!.lifecycle).toBe('running');
        expect(cards[1]!.tokens).toBeNull();
        expect(cards[1]!.lifecycle).toBe('queued');
    });
    it('deriveCards without the token map keeps null tokens (back-compat)', () => {
        const cards = deriveCards([run({})], []);
        expect(cards[0]!.tokens).toBeNull();
    });
});
