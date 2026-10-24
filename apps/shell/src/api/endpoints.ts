/** Gateway API surface (PRD §4/§5). Backend lives in fusion-gateway (R-1). */
import { sharedClient } from './client';

export interface SessionUser {
    user_id: string;
    display_name: string;
    roles: string[];
    permissions: string[];
    must_change_password: boolean;
}

export interface AdminUserRow {
    user_id: string;
    display_name: string;
    roles: string[];
    disabled: boolean;
    must_change_password: boolean;
    permissions: string[];
    created_at?: number;
}

export interface ManifestDto {
    id: string;
    title: string;
    title_en?: string;
    version?: string;
    path: string;
    icon?: string;
    entry: string;
    health?: string;
    backend?: string;
    devices: string[];
    category: string;
    unreachable?: boolean;
    /** Schema v1 ext (issue #24) — unknown JSON until sanitized by the store. */
    searchProviders?: unknown;
    pages?: unknown;
    notifications?: unknown;
    /** Home contribution (issue #32, gateway #263): {cards: [...]}. */
    home?: unknown;
    /** Permissions-Policy feature delegation (issue #66), sanitized by the store. */
    permissions_policy?: string[];
    /** Schema v2 menu grouping (issue #71), sanitized by the store. */
    group?: string;
    group_title?: string;
    group_title_en?: string;
    sort?: number;
}

export function login(
    username: string,
    password: string
): Promise<SessionUser & { token: string }> {
    return sharedClient().post('/api/v1/shell/session', { username, password });
}

export function logout(): Promise<void> {
    return sharedClient().post('/api/v1/shell/session/logout');
}

export function fetchMe(): Promise<SessionUser> {
    return sharedClient().get('/api/v1/shell/me');
}

export function fetchManifests(): Promise<ManifestDto[]> {
    return sharedClient().get('/api/v1/shell/manifests');
}

/**
 * Loaded engine models for the global selector (issue #34): fusion-mlx's
 * OpenAI list route reached through the same-origin module proxy.
 */
export function fetchEngineModels(): Promise<string[]> {
    return sharedClient()
        .get<{ data?: Array<{ id?: string }> }>('/shell/fusion-mlx/v1/models', { quiet: true })
        .then((r) =>
            (r.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
        )
        .catch((err) => {
            console.warn('[endpoints] engine model list failed', err);
            return [];
        });
}

export function changePassword(password: string): Promise<void> {
    return sharedClient().post('/api/v1/password', { password });
}

export function listUsers(): Promise<AdminUserRow[]> {
    return sharedClient().get('/api/v1/shell/users');
}

export function createUser(body: {
    username: string;
    display_name: string;
    password: string;
    permissions: string[];
}): Promise<AdminUserRow> {
    return sharedClient().post('/api/v1/shell/users', body);
}

export function updateUser(
    userId: string,
    patch: Partial<Pick<AdminUserRow, 'display_name' | 'disabled' | 'permissions' | 'roles'>>
): Promise<AdminUserRow> {
    return sharedClient().patch(`/api/v1/shell/users/${userId}`, patch);
}

export function resetUserPassword(userId: string): Promise<{ temp_password: string }> {
    return sharedClient().post(`/api/v1/shell/users/${userId}/password-reset`);
}

export function deleteUser(userId: string): Promise<void> {
    return sharedClient().delete(`/api/v1/shell/users/${userId}`);
}

// ── Migration E6 admin surfaces (issue #42) ──────────────────────────────
// Contracts in docs/f-ecommerce-migration-e6.md. Until the gateway ships
// them these throw with status 404 — pages degrade to a gateway-pending
// notice instead of an error wall.

export interface AdapterBody {
    credentials: Record<string, string>;
    rate_limit_rps: number;
    jitter_ms: number;
    enabled: boolean;
}

export function listAdapters(): Promise<unknown> {
    return sharedClient().get('/api/v1/shell/adapters', { quiet: true });
}

export function saveAdapter(platform: string, body: AdapterBody): Promise<unknown> {
    return sharedClient().put(`/api/v1/shell/adapters/${platform}`, body);
}

export function testAdapter(platform: string): Promise<unknown> {
    return sharedClient().post(`/api/v1/shell/adapters/${platform}/test`, {});
}

export function listConnectors(): Promise<unknown> {
    return sharedClient().get('/api/v1/shell/connectors', { quiet: true });
}

export function saveConnector(id: string, doc: unknown): Promise<unknown> {
    return sharedClient().put(`/api/v1/shell/connectors/${id}`, doc);
}

export function testConnector(id: string, operation?: string): Promise<unknown> {
    return sharedClient().post(`/api/v1/shell/connectors/${id}/test`, { operation });
}

export function loadConfig(key: string): Promise<unknown> {
    return sharedClient().get(`/api/v1/shell/config/${key}`, { quiet: true });
}

export function saveConfig(key: string, body: unknown): Promise<unknown> {
    return sharedClient().put(`/api/v1/shell/config/${key}`, body);
}

export function fetchAudit(user: string, actionClass: string): Promise<unknown> {
    const params = new URLSearchParams();
    if (user.trim()) params.set('user', user.trim());
    if (actionClass) params.set('action_class', actionClass);
    const q = params.toString();
    return sharedClient().get(`/api/v1/shell/audit${q ? `?${q}` : ''}`, { quiet: true });
}

export function listRoles(): Promise<unknown> {
    return sharedClient().get('/api/v1/shell/roles', { quiet: true });
}

export function createRole(body: {
    name: string;
    description: string;
    write_classes: string[];
}): Promise<unknown> {
    return sharedClient().post('/api/v1/shell/roles', body);
}

export function deleteRole(name: string): Promise<unknown> {
    return sharedClient().delete(`/api/v1/shell/roles/${name}`);
}

export function loadMenuPermissions(): Promise<unknown> {
    return sharedClient().get('/api/v1/shell/menu-permissions', { quiet: true });
}

export function saveMenuPermissions(body: unknown): Promise<unknown> {
    return sharedClient().put('/api/v1/shell/menu-permissions', body);
}

/** True when an error is the gateway surface not shipped yet (404/501). */
export function isGatewayPending(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    return status === 404 || status === 501;
}
