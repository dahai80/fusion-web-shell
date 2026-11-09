import { describe, expect, it } from 'bun:test';
import {
    type CoworkRun,
    deriveCards,
    deriveStats,
    deriveWaterfall,
    statusFromRun,
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
