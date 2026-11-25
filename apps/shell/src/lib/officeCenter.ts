import { sharedClient } from '@/api/client';

/**
 * Agentic Office command center data layer (issue #191, prototype
 * 01-command-center). All surfaces are existing planes reached through the
 * gateway shell proxy — the page adds routing UI only, no new execution
 * plane:
 *   - dispatch: fusion-site console tasks BFF (`POST /api/console/tasks`,
 *     site #153) which forwards to the fusion-ops broker mailbox; the
 *     device-side office executor owns param semantics, the cloud only
 *     routes (plan §8.2, FR-8)
 *   - runs: cowork DAG run list (`GET /api/runs`)
 *   - artifacts: fusion-artifacts-engine (`GET /api/v1/artifacts`)
 *   - health: per-module liveness endpoints through the gateway; office-api
 *     rides an API-only module hop (no sidebar manifest), a missing route
 *     degrades to the honest no_route state
 */

const SITE_CONSOLE_PREFIX = '/shell/fusion-site/api/console';

/** Command-bar route selector (prototype 01): which office agent handles it. */
export type OfficeRoute = 'documents' | 'sheets' | 'slides';

export const OFFICE_ROUTES: OfficeRoute[] = ['documents', 'sheets', 'slides'];

/**
 * Broker task `type` per route — the broker action class, NOT the office
 * app (that rides `params.route` verbatim; the device executor owns the
 * interpretation). Same three-value enum the site task bridge ships
 * (fusion-site src/lib/console.ts TASK_TYPES).
 */
export const OFFICE_ROUTE_TYPE: Record<OfficeRoute, string> = {
    documents: 'generate',
    sheets: 'analyze',
    slides: 'generate',
};

/**
 * Target device for dispatch. The console devices BFF (fusion-site#166 Gap
 * 2) exposes the broker device list to shell sessions; dispatch resolves
 * the default-execution online device through it and only falls back to
 * this constant when the BFF is unreachable — the broker then answers 404
 * E_OFFLINE and the page degrades visibly.
 */
export const OFFICE_DEFAULT_DEVICE = 'default';

/** Sanitized broker device row (console devices BFF). */
export interface OfficeDevice {
    deviceId: string;
    online: boolean;
    isDefault: boolean;
}

interface RawDevice {
    device_id?: unknown;
    online?: unknown;
    is_default_execution?: unknown;
}

/** Defensive parse of GET /shell/fusion-site/api/console/devices. */
export function parseOfficeDevices(payload: unknown): OfficeDevice[] {
    const devices =
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { devices?: unknown }).devices)
            ? ((payload as { devices: unknown[] }).devices as RawDevice[])
            : [];
    const out: OfficeDevice[] = [];
    for (const d of devices) {
        if (typeof d.device_id !== 'string' || d.device_id === '') continue;
        out.push({
            deviceId: d.device_id,
            online: d.online === true,
            isDefault: d.is_default_execution === true,
        });
    }
    return out;
}

/**
 * Resolve the dispatch target: online default-execution device, else any
 * online device, else the static fallback. Never throws — a bad resolve
 * degrades to a broker-side 404 the page shows verbatim.
 */
export async function resolveOfficeDevice(): Promise<string> {
    try {
        const devices = parseOfficeDevices(
            await sharedClient().get(`${SITE_CONSOLE_PREFIX}/devices`, { quiet: true })
        );
        const pick = devices.find((d) => d.isDefault && d.online) ?? devices.find((d) => d.online);
        if (pick) return pick.deviceId;
    } catch (err) {
        console.warn('[office-center] device resolve failed, using fallback', err);
    }
    return OFFICE_DEFAULT_DEVICE;
}

/** Sanitized row of the cowork DAG run list (left zone). */
export interface OfficeRun {
    runId: string;
    name: string;
    workflowId: string;
    status: string;
    createdAt: number | null;
    error: string | null;
}

interface RawRun {
    run_id?: unknown;
    workflow_name?: unknown;
    workflow_id?: unknown;
    status?: unknown;
    created_at?: unknown;
    error?: unknown;
}

/** Defensive parse of GET /shell/fusion-cowork/api/runs (pure, test-pinned). */
export function parseOfficeRuns(payload: unknown): OfficeRun[] {
    const runs =
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { runs?: unknown }).runs)
            ? ((payload as { runs: unknown[] }).runs as RawRun[])
            : [];
    const out: OfficeRun[] = [];
    for (const r of runs) {
        if (typeof r.run_id !== 'string' || r.run_id === '') continue;
        out.push({
            runId: r.run_id,
            name: typeof r.workflow_name === 'string' ? r.workflow_name : '',
            workflowId: typeof r.workflow_id === 'string' ? r.workflow_id : '',
            status: typeof r.status === 'string' ? r.status : 'unknown',
            createdAt: typeof r.created_at === 'number' ? r.created_at : null,
            error: typeof r.error === 'string' && r.error ? r.error : null,
        });
    }
    return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** Sanitized recent-artifact row (right zone, deep links to the library). */
export interface OfficeArtifact {
    id: string;
    name: string;
    kind: string;
    version: number;
}

interface RawArtifact {
    id?: unknown;
    name?: unknown;
    kind?: unknown;
    current_version?: unknown;
}

/** Defensive parse of GET /shell/fusion-artifacts/api/v1/artifacts. */
export function parseOfficeArtifacts(payload: unknown): OfficeArtifact[] {
    const items =
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { artifacts?: unknown }).artifacts)
            ? ((payload as { artifacts: unknown[] }).artifacts as RawArtifact[])
            : [];
    const out: OfficeArtifact[] = [];
    for (const a of items) {
        if (typeof a.id !== 'string' || a.id === '') continue;
        out.push({
            id: a.id,
            name: typeof a.name === 'string' ? a.name : a.id,
            kind: typeof a.kind === 'string' ? a.kind : '',
            version: typeof a.current_version === 'number' ? a.current_version : 1,
        });
    }
    return out;
}

export interface DispatchResult {
    taskId: string;
}

/**
 * Command-bar dispatch (top zone): route the NL task through the fusion-site
 * console tasks BFF to the fusion-ops broker mailbox. 201 → queued; 404 →
 * unknown device (E_OFFLINE); 403 → shell role not console-authorized
 * (upstream gap); 502 → broker unreachable. Errors surface verbatim — the
 * page shows them, it never fakes a queue.
 */
export async function dispatchOfficeTask(
    route: OfficeRoute,
    text: string
): Promise<DispatchResult> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('empty task text');
    const deviceId = await resolveOfficeDevice();
    const res = await sharedClient().post<{ task_id?: string; detail?: string }>(
        `${SITE_CONSOLE_PREFIX}/tasks`,
        {
            device_id: deviceId,
            type: OFFICE_ROUTE_TYPE[route],
            params: {
                route,
                prompt: trimmed,
                artifact_mode: 'index+preview',
                confirm: 'local',
            },
        },
        { quiet: true }
    );
    const taskId = res.task_id ?? '';
    if (!taskId) throw new Error('dispatch accepted but no task_id returned');
    return { taskId };
}

export type HealthState = 'ok' | 'warn' | 'down' | 'no_route';

export interface HealthEntry {
    id: string;
    label: string;
    labelEn: string;
    /** Gateway probe path; null = no route exists. */
    probePath: string | null;
    port: number | null;
    state: HealthState;
    detail: string;
}

/** Bottom strip targets (prototype 01 topbar pills, issue zone 4). office-api
 * rides an API-only gateway module hop (no manifest entry, no sidebar item);
 * the null probePath fallback stays for a route that disappears. */
const HEALTH_TARGETS: Omit<HealthEntry, 'state' | 'detail'>[] = [
    {
        id: 'mlx',
        label: 'fusion-mlx',
        labelEn: 'fusion-mlx',
        probePath: '/shell/fusion-mlx/health',
        port: 11434,
    },
    {
        id: 'office-api',
        label: 'office-api',
        labelEn: 'office-api',
        probePath: '/shell/office-api/healthz',
        port: 11492,
    },
    {
        id: 'rag',
        label: 'fusion-rag',
        labelEn: 'fusion-rag',
        probePath: '/shell/fusion-rag/health',
        port: 11436,
    },
    {
        id: 'artifacts',
        label: 'artifacts',
        labelEn: 'artifacts',
        probePath: '/shell/fusion-artifacts/healthz',
        port: 11451,
    },
    {
        id: 'cowork',
        label: 'fusion-cowork',
        labelEn: 'fusion-cowork',
        probePath: '/shell/fusion-cowork/health',
        port: 11461,
    },
];

interface HealthBody {
    status?: unknown;
    ready?: unknown;
}

/** Liveness probe of one module path; caller wraps failures. */
async function probeOne(target: Omit<HealthEntry, 'state' | 'detail'>): Promise<HealthEntry> {
    if (!target.probePath) {
        return { ...target, state: 'no_route', detail: 'no gateway route (:11492 direct only)' };
    }
    try {
        const body = await sharedClient().get<HealthBody>(target.probePath, { quiet: true });
        const status = typeof body.status === 'string' ? body.status : '';
        const ready = body.ready === undefined ? true : body.ready === true;
        if (status === 'ok' || status === 'healthy') {
            return { ...target, state: ready ? 'ok' : 'warn', detail: status };
        }
        return { ...target, state: 'warn', detail: status || 'unexpected status body' };
    } catch (err) {
        console.warn(`[office-center] health probe failed: ${target.id}`, err);
        return {
            ...target,
            state: 'down',
            detail: err instanceof Error ? err.message : 'probe failed',
        };
    }
}

/** Probe all strip targets in parallel; never throws. */
export async function probeOfficeHealth(): Promise<HealthEntry[]> {
    return Promise.all(HEALTH_TARGETS.map(probeOne));
}
