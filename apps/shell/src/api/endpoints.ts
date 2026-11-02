/** Gateway API surface (PRD §4/§5). Backend lives in fusion-gateway (R-1). */
import { type ShellModel, uniqueModels } from '../lib/modelCatalog';
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
    /** Gateway serves camelCase; older static configs used snake_case. */
    permissionsPolicy?: string[];
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
 * Session-gated model catalog for the global selector (issue #94,
 * fusion-gateway#443): the gateway router's full list — local (loaded +
 * unloaded), cloud backends (glm-5 …) and aliases — so the picker can
 * offer everything shell chat can actually route to.
 */
export function fetchShellModels(): Promise<ShellModel[]> {
    return sharedClient()
        .get<{
            data?: Array<{
                id?: string;
                owned_by?: string;
                loaded?: boolean;
                engine_type?: string;
            }>;
        }>('/api/v1/shell/models', { quiet: true })
        .then((r) =>
            uniqueModels(
                (r.data ?? [])
                    .filter(
                        (
                            m
                        ): m is {
                            id: string;
                            owned_by?: string;
                            loaded?: boolean;
                            engine_type?: string;
                        } => typeof m.id === 'string' && m.id.length > 0
                    )
                    .map((m) => ({
                        id: m.id,
                        ownedBy: typeof m.owned_by === 'string' ? m.owned_by : '',
                        loaded: m.loaded === true,
                        engineType: typeof m.engine_type === 'string' ? m.engine_type : '',
                    }))
            )
        )
        .catch((err) => {
            console.warn('[endpoints] shell model catalog failed', err);
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
// Audit/roles/menu-permissions live here; the adapter/connector/policy
// settings sections were removed from the shell (their management belongs
// to the e-commerce module's own settings — see
// ~/fusion/business/ai-ecommerce/docs/shell-settings-transfer-1102.md).

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
