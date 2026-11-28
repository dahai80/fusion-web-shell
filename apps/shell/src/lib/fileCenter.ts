import { ArtifactsClient, RpcError } from '@fusion/artifacts-client';

/**
 * Artifact file center data layer (issue #196 leg 1). Consumes the
 * OFFICIAL vendored TS client (@fusion/artifacts-client, copy of
 * fusion-artifacts-engine/client-rpc#141) through the gateway JSON-RPC
 * proxy POST /api/v1/artifacts — the engine API key never reaches the
 * browser, and the gateway stamps caller/owner identity from the shell
 * session, so this layer never sends tenant fields (asserted in tests).
 *
 * Open-in-module routing is manifest-driven: the page resolves the
 * module id returned by `openModuleIdFor` against the live manifest
 * registry — no hardcoded module list (clean-landing requirement).
 */

const RPC_PATH = '/api/v1/artifacts';

let clientInstance: ArtifactsClient | null = null;

/** Shared JSON-RPC client pointed at the gateway proxy. */
export function artifactsClient(): ArtifactsClient {
    if (!clientInstance) {
        // Authorization rides the shared session cookie; the client's apiKey
        // option stays unset on purpose. fetch is wrapped (not passed bare):
        // the client stores the function reference and calls it without a
        // receiver, which throws "Illegal invocation" in browsers.
        clientInstance = new ArtifactsClient(RPC_PATH, {
            timeoutMs: 15000,
            fetch: ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch,
        });
    }
    return clientInstance;
}

/** Test seam: inject a client with a mocked fetch (mirrors #195 precedent). */
export function setArtifactsClientForTest(c: ArtifactsClient | null): void {
    clientInstance = c;
}

/**
 * Gateway-failure-aware call: HTTP-level rejections (401 session envelope,
 * 403 RBAC envelope, 502 upstream) arrive without a JSON-RPC error field,
 * so an undefined result means the gateway answered outside the RPC
 * contract — surface it as a thrown error instead of silently returning
 * undefined.
 */
export async function rpcCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const result = await artifactsClient().call<T>(method, params);
    if (result === undefined || result === null) {
        console.warn(`[file-center] gateway returned a non-RPC envelope for ${method}`);
        throw new Error(`artifacts request failed: ${method}`);
    }
    return result;
}

export interface FileRow {
    id: string;
    name: string;
    type: string;
    kind: string;
    summary: string;
    ownerUserId: string;
    ownershipType: string;
    updatedAt: number;
    starred: boolean;
}

interface RawArtifact {
    id?: unknown;
    name?: unknown;
    type?: unknown;
    kind?: unknown;
    summary?: unknown;
    owner_user_id?: unknown;
    ownership_type?: unknown;
    updated_at?: unknown;
    is_starred?: unknown;
}

/** Defensive parse of one artifact row; junk rows are dropped. */
export function parseFileRow(raw: unknown): FileRow | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as RawArtifact;
    if (typeof r.id !== 'string' || !r.id) return null;
    return {
        id: r.id,
        name: typeof r.name === 'string' ? r.name : '(unnamed)',
        type: typeof r.type === 'string' ? r.type : '',
        kind: typeof r.kind === 'string' ? r.kind : '',
        summary: typeof r.summary === 'string' ? r.summary : '',
        ownerUserId: typeof r.owner_user_id === 'string' ? r.owner_user_id : '',
        ownershipType: typeof r.ownership_type === 'string' ? r.ownership_type : '',
        updatedAt: typeof r.updated_at === 'number' ? r.updated_at : 0,
        starred: r.is_starred === true,
    };
}

interface ListPayload {
    artifacts?: unknown;
    total?: unknown;
}

function parseList(payload: ListPayload): { rows: FileRow[]; total: number } {
    const rows = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
    return {
        rows: rows.map(parseFileRow).filter((f): f is FileRow => f !== null),
        total: typeof payload?.total === 'number' ? payload.total : rows.length,
    };
}

/** Files list from artifact.list_all via the gateway proxy. */
export async function fetchFiles(page = 1): Promise<{ rows: FileRow[]; total: number }> {
    return parseList(await rpcCall('artifact.list_all', { page, page_size: 50 }));
}

/** Recycle bin rows from artifact.list_recycle. */
export async function fetchRecycleFiles(page = 1): Promise<{ rows: FileRow[]; total: number }> {
    return parseList(await rpcCall('artifact.list_recycle', { page, page_size: 50 }));
}

/** Restore one artifact from the recycle bin. */
export async function restoreFile(artifactId: string): Promise<{ ok: boolean; detail: string }> {
    try {
        await rpcCall('artifact.restore', { artifact_id: artifactId });
        console.log(`[file-center] artifact ${artifactId} restored`);
        return { ok: true, detail: '' };
    } catch (err) {
        const detail = err instanceof RpcError ? err.message : 'restore failed';
        console.warn(`[file-center] artifact ${artifactId} restore failed: ${detail}`);
        return { ok: false, detail };
    }
}

/**
 * Manifest-driven open routing (plan: spreadsheet / documents / pdf /
 * presentation by artifact type). Returns the shell module id; the page
 * resolves it against the live manifest registry.
 */
export function openModuleIdFor(artifact: Pick<FileRow, 'type' | 'kind'>): string {
    const t = `${artifact.type} ${artifact.kind}`.toLowerCase();
    if (/(xlsx|xlsm|sheet|spreadsheet|csv|data)/.test(t)) return 'fusion-office-spreadsheet';
    if (/(pdf)/.test(t)) return 'fusion-office-pdf';
    if (/(pptx|presentation|slides)/.test(t)) return 'fusion-office-presentation';
    return 'fusion-office-documents';
}

/** Human file-type label for the row chip. */
export function fileTypeLabel(artifact: Pick<FileRow, 'type' | 'kind'>): string {
    return artifact.type || artifact.kind || 'file';
}
