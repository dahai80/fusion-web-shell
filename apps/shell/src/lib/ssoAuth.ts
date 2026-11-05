/**
 * Cloud-try SSO ticket consumption (issue #130, Phase 2 of
 * fusion-cloud-try-real-product-1104): fusion-site appends a short-lived
 * one-time ticket (issued by fusion-identity) to the workbench URL; the
 * shell exchanges it for its own session so users get single sign-on
 * without a second login.
 *
 * Proposed gateway contract (gateway upstream issue pending):
 *   POST /api/v1/shell/session/sso {ticket} →
 *   {token, identity_token?, username?, roles?}
 *
 * Transitional honesty: 404/501 (route not shipped yet) degrade to null so
 * restoreSession falls through to the existing local/portal flows — the
 * user is never stranded on a dead end.
 */

export interface SsoSession {
    token: string;
    identity_token?: string;
    username?: string;
    roles?: string[];
}

/** Read + strip ?ticket= from the URL (single use: gone after replaceState). */
export function consumeTicketParam(): string | null {
    const url = new URL(window.location.href);
    const ticket = url.searchParams.get('ticket');
    if (!ticket) return null;
    url.searchParams.delete('ticket');
    window.history.replaceState(null, '', url.toString());
    return ticket;
}

/**
 * Exchange a one-time identity ticket for a shell session. Returns null when
 * the SSO route is not deployed yet (honest degradation), throws on other
 * failures so the caller can log and fall back to local login.
 */
export async function exchangeTicket(ticket: string): Promise<SsoSession | null> {
    const res = await fetch('/api/v1/shell/session/sso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
    });
    if (res.status === 404 || res.status === 501) {
        console.warn('[sso] ticket exchange route pending (gateway upstream), skipping');
        return null;
    }
    if (!res.ok) {
        const err = new Error(`sso ticket exchange failed (status ${res.status})`) as Error & {
            status: number;
        };
        err.status = res.status;
        throw err;
    }
    const body = (await res.json()) as Partial<SsoSession>;
    if (!body.token) throw new Error('sso ticket exchange returned no session token');
    return {
        token: body.token,
        identity_token: body.identity_token,
        username: body.username,
        roles: body.roles,
    };
}
