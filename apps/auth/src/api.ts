/**
 * Portal API client (issue #125). All calls go through the gateway
 * /api/auth/* surface (design doc §6: raw identity :11470 never reaches
 * browsers; gateway #506 wires the routes). Missing routes (404/501) pin
 * `backendPending` instead of surfacing raw errors — the identity
 * registration endpoints (identity #39/#40) are upstream-pending.
 */

export class ApiPendingError extends Error {
    status: number;
    constructor(status: number) {
        super(`auth api pending (status ${status})`);
        this.status = status;
    }
}

async function call(path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 || res.status === 501) throw new ApiPendingError(res.status);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
        const err = data.error as { message?: string } | undefined;
        throw new Error(err?.message ?? `request failed (status ${res.status})`);
    }
    return data;
}

export interface TokenPair {
    access_token?: string;
    refresh_token?: string;
    must_change_password?: boolean;
    mfa_required?: boolean;
    email_verified?: boolean;
}

export const api = {
    login: (username: string, password: string) =>
        call('/api/auth/login', { username, password }) as Promise<TokenPair>,

    registerPersonal: (input: {
        username: string;
        password: string;
        display_name?: string;
        email?: string;
    }) => call('/api/auth/register', input) as Promise<TokenPair>,

    registerTenant: (input: {
        tenant_display_name: string;
        admin_username: string;
        admin_password: string;
        admin_email?: string;
        plan?: string;
    }) => call('/api/auth/register-tenant', input) as Promise<TokenPair>,

    join: (input: { tenant: string; mode: 'invite' | 'request' | 'open'; invite_code?: string }) =>
        call('/api/auth/join', input) as Promise<TokenPair>,

    resendVerification: () => call('/api/auth/verification/resend', {}) as Promise<unknown>,

    /**
     * Mint the one-time handoff code bound to the validated return path
     * (§8: 60s TTL, single use, origin allowlist). Gateway #506 contract;
     * 404 pins pending like every other route.
     */
    handoff: (return_path: string) =>
        call('/api/auth/handoff', { return_path }) as Promise<{ code?: string }>,
};

/**
 * One-time code handoff (design doc §6/§8): after a successful auth call the
 * portal redirects back to the origin client with ?code= — 60s TTL, single
 * use, origin-bound on the gateway side. The `return` param is validated:
 * same-origin paths only, no off-site redirects.
 */
export function safeReturnPath(): string | null {
    const raw = new URLSearchParams(window.location.search).get('return');
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
}

export function redirectToClient(code: string): void {
    const path = safeReturnPath();
    if (!path) {
        console.warn('[auth-portal] no safe return path; staying on portal');
        return;
    }
    const sep = path.includes('?') ? '&' : '?';
    window.location.assign(`${path}${sep}code=${encodeURIComponent(code)}`);
}
