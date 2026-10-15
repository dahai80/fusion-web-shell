import { create } from 'zustand';

export interface ShellUser {
    user_id: string;
    display_name: string;
    roles: string[];
    permissions: string[];
    must_change_password: boolean;
}

interface AuthState {
    user: ShellUser | null;
    token: string | null;
    status: 'unknown' | 'guest' | 'authed';
    setUser(user: ShellUser, token: string): void;
    clearUser(): void;
    /** Menu renders only granted manifests; login shows nothing by default (PRD §4.2). */
    canView(manifestId: string): boolean;
}

const TOKEN_KEY = 'fusion.shell.token';

export function readToken(): string | null {
    try {
        return sessionStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function writeToken(token: string | null): void {
    try {
        if (token) sessionStorage.setItem(TOKEN_KEY, token);
        else sessionStorage.removeItem(TOKEN_KEY);
    } catch (err) {
        console.warn('[auth] token storage failed', err);
    }
}

export const useAuth = create<AuthState>((set, get) => ({
    user: null,
    token: readToken(),
    status: 'unknown',
    setUser(user, token) {
        writeToken(token);
        set({ user, token, status: 'authed' });
        console.log('[auth] user authed:', user.user_id, 'permissions:', user.permissions.length);
    },
    clearUser() {
        writeToken(null);
        set({ user: null, token: null, status: 'guest' });
    },
    canView(manifestId) {
        const user = get().user;
        if (!user) return false;
        return user.roles.includes('admin') || user.permissions.includes(manifestId);
    },
}));
