import { sharedClient } from '@/api/client';

/**
 * Agents overview dashboard data layer (issue #137). Consumes existing
 * gateway surfaces only — cowork runs + HITL pending list, agent-studio
 * registry — via the `/shell/<module-id>/<path>` module API proxy that
 * carries the shell session Bearer. No new backend.
 */

export interface CoworkRun {
    run_id: string;
    workflow_id?: string;
    workflow_name?: string;
    status: string;
    /** Live API: epoch seconds (float); some serializers may return ISO. */
    created_at?: number | string;
    finished_at?: number | string;
    error?: string | null;
    space_id?: string;
    review?: { status?: string };
}

/** Run timestamp in epoch ms, accepting epoch seconds and ISO strings. */
export function runTsMs(v: number | string | undefined): number {
    if (v === undefined) return 0;
    const ms = typeof v === 'number' ? (v > 1e12 ? v : v * 1000) : Date.parse(v);
    return Number.isFinite(ms) ? ms : 0;
}

export interface CoworkRunDetail {
    run_id: string;
    status: string;
    started_at?: string;
    finished_at?: string;
    steps?: CoworkRunStep[];
}

export interface CoworkRunStep {
    node_id: string;
    node_name?: string;
    node_display_name?: string;
    status?: string;
    execution_time?: number;
    summary?: string;
    output_data?: Record<string, unknown>;
    /** issue #143 per-node LLM usage (None = no LLM call). */
    tokens?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    } | null;
}

export interface StudioAgent {
    agent_id: string;
    name: string;
    status?: string;
    model?: string;
}

export interface PendingApprovals {
    approvals: Array<Record<string, unknown>>;
}

/** Derived card state for one tracked agent (prototype taxonomy). */
export type AgentCardStatus = 'run' | 'wait' | 'idle' | 'err';

const COWORK_PREFIX = '/shell/fusion-cowork/api';
const STUDIO_PREFIX = '/shell/fusion-agent-studio/api/v1';

export async function fetchRuns(): Promise<CoworkRun[]> {
    const data = await sharedClient().get<{ runs?: CoworkRun[] }>(`${COWORK_PREFIX}/runs`, {
        quiet: true,
    });
    return Array.isArray(data.runs) ? data.runs : [];
}

export async function fetchPending(): Promise<PendingApprovals> {
    return sharedClient().get<PendingApprovals>(`${COWORK_PREFIX}/permissions/pending`, {
        quiet: true,
    });
}

export async function fetchRunDetail(runId: string): Promise<CoworkRunDetail> {
    return sharedClient().get<CoworkRunDetail>(`${COWORK_PREFIX}/runs/${runId}`, { quiet: true });
}

export async function fetchStudioAgents(): Promise<StudioAgent[]> {
    const data = await sharedClient().get<{ data?: StudioAgent[] }>(`${STUDIO_PREFIX}/agents`, {
        quiet: true,
    });
    return Array.isArray(data.data) ? data.data : [];
}

/**
 * Card status from a run row (pure, test-pinned): running → pulse, a run
 * blocked on human review/waiting → wait, failed/cancelled → err, rest idle.
 */
export function statusFromRun(run: Pick<CoworkRun, 'status' | 'review'>): AgentCardStatus {
    if (run.status === 'failed' || run.status === 'cancelled') return 'err';
    if (run.status === 'running') {
        if (run.review?.status === 'pending_review') return 'wait';
        return 'run';
    }
    return 'idle';
}

export interface DerivedAgentCard {
    agentId: string;
    name: string;
    roleZh: string;
    roleEn: string;
    status: AgentCardStatus;
    runId: string | null;
    workflowName: string;
    startedAt: number | string | null;
    error: string | null;
}

const WORKFLOW_ROLE_ZH: Record<string, string> = {
    product_lifecycle: '交付流水线 · 全流程',
    coder_dispatch: 'Coder 派发 · 编码',
    governance_issue: '治理 · Issue 流转',
};

/**
 * Derive one card per cowork workflow seen in recent runs, ordered by the
 * freshest activity. agent-studio registry agents (published, no live run)
 * are appended as idle seats so the grid shows the whole fleet.
 */
export function deriveCards(runs: CoworkRun[], studioAgents: StudioAgent[]): DerivedAgentCard[] {
    const seen = new Map<string, DerivedAgentCard>();
    for (const run of runs) {
        const key = run.workflow_id || run.workflow_name || 'unknown';
        const existing = seen.get(key);
        // First hit wins: the runs list is newest-first, so the first run per
        // workflow is its current activity.
        if (existing) continue;
        const wf = key;
        seen.set(key, {
            agentId: wf,
            name: wf,
            roleZh: WORKFLOW_ROLE_ZH[wf] ?? '协作工作流',
            roleEn: WORKFLOW_ROLE_ZH[wf] ?? 'Cowork workflow',
            status: statusFromRun(run),
            runId: run.run_id,
            workflowName: run.workflow_name ?? wf,
            startedAt: run.created_at ?? null,
            error: run.error ?? null,
        });
    }
    const cards = [...seen.values()];
    for (const agent of studioAgents) {
        const key = `studio:${agent.agent_id}`;
        if (seen.has(key)) continue;
        seen.set(key, {
            agentId: key,
            name: agent.name || agent.agent_id,
            roleZh: '座位 · 已发布待命',
            roleEn: 'Seat · published idle',
            status: agent.status === 'published' ? 'idle' : 'err',
            runId: null,
            workflowName: agent.model ?? '',
            startedAt: null,
            error: null,
        });
        cards.push(seen.get(key) as DerivedAgentCard);
    }
    return cards;
}

/** Stats row (prototype taxonomy), derived from the same run list. */
export interface AgentsStats {
    activeRuns: number;
    waiting: number;
    completedToday: number;
    failed: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveStats(runs: CoworkRun[], now = Date.now()): AgentsStats {
    let activeRuns = 0;
    let waiting = 0;
    let completedToday = 0;
    let failed = 0;
    for (const run of runs) {
        const st = statusFromRun(run);
        if (st === 'run') activeRuns += 1;
        if (st === 'wait') waiting += 1;
        if (st === 'err') failed += 1;
        if (run.status === 'success' && run.finished_at) {
            const ts = runTsMs(run.finished_at);
            if (ts && now - ts < DAY_MS) completedToday += 1;
        }
    }
    return { activeRuns, waiting, completedToday, failed };
}

/** Waterfall rows from a run detail: per-node progress percent (pure). */
export interface WaterfallRow {
    nodeId: string;
    label: string;
    status: string;
    percent: number;
    durationSec: number | null;
}

const STEP_DONE = new Set(['success', 'done', 'completed', 'skipped']);
const STEP_RUNNING = new Set(['running', 'in_progress']);

export function deriveWaterfall(detail: CoworkRunDetail): WaterfallRow[] {
    const steps = detail.steps ?? [];
    return steps.map((s) => {
        const st = s.status ?? 'pending';
        let percent = 0;
        if (STEP_DONE.has(st)) percent = 100;
        else if (STEP_RUNNING.has(st)) percent = 60;
        return {
            nodeId: s.node_id,
            label: s.node_display_name || s.node_name || s.node_id,
            status: st,
            percent,
            durationSec: typeof s.execution_time === 'number' ? s.execution_time : null,
        };
    });
}

/**
 * Token aggregation (user feedback on #137): per-workflow token consumption
 * from run details. Steps carry `tokens` (cowork issue #143); None/missing
 * steps count as zero — upstream may not backfill simple nodes yet.
 */
export interface WorkflowTokens {
    workflow: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    runs: number;
}

export interface TokensSummary {
    total: number;
    workflows: WorkflowTokens[];
}

export function aggregateTokens(
    runs: CoworkRun[],
    detailFor: (runId: string) => CoworkRunDetail | undefined,
    now = Date.now()
): TokensSummary {
    const DAY_MS_LOCAL = 24 * 60 * 60 * 1000;
    const byWorkflow = new Map<string, WorkflowTokens>();
    let total = 0;
    for (const run of runs) {
        // Only runs active/finished today count toward "today's tokens".
        const ts = runTsMs(run.created_at);
        if (!ts || now - ts > DAY_MS_LOCAL) continue;
        const detail = detailFor(run.run_id);
        if (!detail) continue;
        const wf = run.workflow_id || run.workflow_name || 'unknown';
        let entry = byWorkflow.get(wf);
        if (!entry) {
            entry = { workflow: wf, promptTokens: 0, completionTokens: 0, totalTokens: 0, runs: 0 };
            byWorkflow.set(wf, entry);
        }
        entry.runs += 1;
        for (const step of detail.steps ?? []) {
            const tk = step.tokens;
            if (!tk) continue;
            const pt = tk.prompt_tokens ?? 0;
            const ct = tk.completion_tokens ?? 0;
            const tt = tk.total_tokens ?? pt + ct;
            entry.promptTokens += pt;
            entry.completionTokens += ct;
            entry.totalTokens += tt;
            total += tt;
        }
    }
    const workflows = [...byWorkflow.values()].sort((a, b) => b.totalTokens - a.totalTokens);
    return { total, workflows };
}
