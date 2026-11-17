/**
 * Agent-studio web-bridge RPC client for the review module (issue #163).
 * Wire shape: POST /v1/rpc {method, params} — NOT JSON-RPC 2.0; handlers
 * return {"status":"error",...} with HTTP 200, so .status is checked before
 * 2xx matters. Same-origin prod path is the gateway module proxy
 * (/shell/fusion-agent-studio/v1/rpc — session cookie carries auth);
 * standalone dev points baseUrl straight at the daemon with a Bearer key.
 */

export interface RpcOk {
    status?: string;
    [key: string]: unknown;
}

export class RpcError extends Error {
    constructor(
        message: string,
        public readonly code: string
    ) {
        super(message);
    }
}

export class ReviewRpc {
    constructor(
        private readonly baseUrl: string,
        private readonly token?: string
    ) {}

    async call(method: string, params: Record<string, unknown> = {}): Promise<RpcOk> {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (this.token) headers.authorization = `Bearer ${this.token}`;
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/v1/rpc`, {
                method: 'POST',
                headers,
                credentials: 'same-origin',
                body: JSON.stringify({ method, params }),
            });
        } catch (err) {
            console.error(`[review] rpc ${method} network failure`, err);
            throw new RpcError(`network failure: ${method}`, 'network');
        }
        if (res.status === 401 || res.status === 403) {
            throw new RpcError(`not authorized: ${method}`, 'unauthorized');
        }
        let data: RpcOk & { message?: string };
        try {
            data = (await res.json()) as RpcOk & { message?: string };
        } catch {
            throw new RpcError(`bad response: ${method} (${res.status})`, 'bad_response');
        }
        if (data.status === 'error') {
            throw new RpcError(data.message ?? `rpc failed: ${method}`, 'rpc_error');
        }
        return data;
    }

    /** Pending review queue: plans (planner.list_plans) + HiTL inputs. */
    async pendingQueue(): Promise<{
        plans: Array<Record<string, unknown>>;
        inputs: Array<Record<string, unknown>>;
    }> {
        const [plans, inputs] = await Promise.all([
            this.call('planner.list_plans', {}),
            this.call('human_input.list_pending', {}),
        ]);
        const planList = Array.isArray(plans.plans)
            ? (plans.plans as Array<Record<string, unknown>>)
            : Array.isArray(plans.items)
              ? (plans.items as Array<Record<string, unknown>>)
              : [];
        return {
            plans: planList,
            inputs: Array.isArray(inputs.inputs)
                ? (inputs.inputs as Array<Record<string, unknown>>)
                : [],
        };
    }

    /** Plan detail for the review pane. */
    async getPlan(planId: string): Promise<Record<string, unknown>> {
        const r = await this.call('planner.get_plan', { plan_id: planId });
        const plan = r.plan;
        if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
            return plan as Record<string, unknown>;
        }
        throw new RpcError(`plan not found: ${planId}`, 'not_found');
    }

    /** Submit anchored feedback (issue #163 AC3): verdict approve closes the
     *  plan; request_changes/question persist the review and keep it pending
     *  — the revising agent reads plan.metadata.review next turn. */
    async submitPlanReview(
        planId: string,
        comments: Array<{
            anchor: { kind: string; id: string; range?: string };
            comment: string;
            verdict: string;
        }>,
        verdict: 'approve' | 'request_changes' | 'question'
    ): Promise<{ approved: boolean; reviewAttached: boolean }> {
        const r = await this.call('planner.approve_plan', {
            plan_id: planId,
            review: { comments, verdict, source: 'web-shell-review' },
        });
        return {
            approved: r.approved === true,
            reviewAttached: r.review_attached === true,
        };
    }

    /** HiTL respond path (sessions paused on human_input nodes). */
    async respondHumanInput(
        inputId: string,
        approved: boolean,
        comments: Array<{
            anchor: { kind: string; id: string; range?: string };
            comment: string;
            verdict: string;
        }>
    ): Promise<void> {
        await this.call('human_input.respond', {
            input_id: inputId,
            approved,
            value: JSON.stringify({ review: comments }),
            reason: comments
                .map((c) => c.comment)
                .join('; ')
                .slice(0, 2000),
        });
    }
}

/** Resolve transport from the runtime environment: same-origin gateway
 *  proxy by default; ?daemon= override + optional ?key= for standalone. */
export function rpcFromEnv(): ReviewRpc {
    const q = new URLSearchParams(window.location.search);
    const daemon = q.get('daemon');
    const key = q.get('key');
    const baseUrl = daemon ?? '/shell/fusion-agent-studio';
    if (daemon || key) {
        console.log('[review] standalone transport', baseUrl, key ? 'bearer-key' : 'session');
    }
    return new ReviewRpc(baseUrl, key ?? undefined);
}
