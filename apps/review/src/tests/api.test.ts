import './domSetup';
import { afterEach, describe, expect, test } from 'bun:test';
import { ReviewRpc, RpcError } from '@/lib/api';

const calls: { last?: { url: string; init: RequestInit } } = {};

function stubFetch(status: number, body: unknown): void {
    // happy-dom global fetch replacement with a call log.
    (globalThis as { fetch: typeof fetch }).fetch = ((url: string | URL, init?: RequestInit) => {
        calls.last = { url: String(url), init: init ?? {} };
        return Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { 'content-type': 'application/json' },
            })
        ) as Promise<Response>;
    }) as typeof fetch;
}

afterEach(() => {
    calls.last = undefined;
});

describe('ReviewRpc', () => {
    test('posts {method, params} and returns ok payload', async () => {
        stubFetch(200, { plans: [{ id: 'p1' }] });
        const rpc = new ReviewRpc('http://x', 'tok');
        const r = await rpc.call('planner.list_plans');
        expect(calls.last!.url).toBe('http://x/v1/rpc');
        expect(JSON.parse(String(calls.last!.init.body))).toEqual({
            method: 'planner.list_plans',
            params: {},
        });
        expect((calls.last!.init.headers as Record<string, string>).authorization).toBe(
            'Bearer tok'
        );
        expect(r.plans).toEqual([{ id: 'p1' }]);
    });

    test('status:error envelope with HTTP 200 raises RpcError', async () => {
        stubFetch(200, { status: 'error', message: 'plan not found: p9' });
        const rpc = new ReviewRpc('http://x');
        await expect(rpc.call('planner.get_plan', { plan_id: 'p9' })).rejects.toThrow(
            new RpcError('plan not found: p9', 'rpc_error')
        );
    });

    test('401/403 map to unauthorized code', async () => {
        stubFetch(403, { detail: 'nope' });
        const rpc = new ReviewRpc('http://x', 'bad');
        await expect(rpc.call('planner.list_plans')).rejects.toThrow(
            new RpcError('not authorized: planner.list_plans', 'unauthorized')
        );
    });

    test('submitPlanReview wraps the #731 review payload', async () => {
        stubFetch(200, { approved: false, review_attached: true, status: 'changes_requested' });
        const rpc = new ReviewRpc('http://x', 'tok');
        const r = await rpc.submitPlanReview(
            'p1',
            [
                {
                    anchor: { kind: 'line', id: 'step-2' },
                    comment: 'wrong span',
                    verdict: 'request_changes',
                },
            ],
            'request_changes'
        );
        const recorded = calls.last!;
        const body = JSON.parse(String(recorded.init.body));
        expect(body.method).toBe('planner.approve_plan');
        expect(body.params.plan_id).toBe('p1');
        expect(body.params.review.source).toBe('web-shell-review');
        expect(body.params.review.verdict).toBe('request_changes');
        expect(body.params.review.comments[0].anchor.id).toBe('step-2');
        expect(r.reviewAttached).toBe(true);
        expect(r.approved).toBe(false);
    });

    test('respondHumanInput packs comments into value JSON + reason', async () => {
        stubFetch(200, { status: 'ok' });
        const rpc = new ReviewRpc('http://x', 'tok');
        await rpc.respondHumanInput('h1', false, [
            {
                anchor: { kind: 'line', id: 'a.ts:3' },
                comment: 'bad line',
                verdict: 'request_changes',
            },
        ]);
        const recorded = calls.last!;
        const body = JSON.parse(String(recorded.init.body));
        expect(body.method).toBe('human_input.respond');
        expect(body.params.input_id).toBe('h1');
        expect(body.params.approved).toBe(false);
        expect(JSON.parse(body.params.value)).toEqual({
            review: [
                {
                    anchor: { kind: 'line', id: 'a.ts:3' },
                    comment: 'bad line',
                    verdict: 'request_changes',
                },
            ],
        });
        expect(body.params.reason).toBe('bad line');
    });

    test('pendingQueue tolerates both plans list shapes and missing inputs', async () => {
        stubFetch(200, { items: [{ id: 'p1' }] });
        const rpc = new ReviewRpc('http://x', 'tok');
        const q = await rpc.pendingQueue();
        expect(q.plans).toEqual([{ id: 'p1' }]);
        expect(q.inputs).toEqual([]);
    });
});
