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
