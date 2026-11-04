/**
 * Unified auth portal consumption (issue #126, design doc §6/§7 P2): the
 * shell owns no auth forms long-term — login/register happen in the portal
 * served by the gateway at /auth (built in this repo as apps/auth; the
 * gateway now ships its own portal at the same route), and the shell
 * redirects to it and returns via one-time code handoff.
 *
 * Live gateway contract (gateway #506, verified on :11432):
 * - portal entry: /auth/?redirect=<absolute url> (allowlist: scheme://host/path)
 * - mint:  POST /auth/api/code          {access_token, refresh_token, ...}
 * - spend: POST /auth/api/code/exchange {code, redirect_uri} → token pair
 *
 * Transitional honesty: every step probes first and degrades to the
 * existing local session flow instead of stranding the user on a 404.
 */

export interface CodeExchange {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    username?: string;
}

/** True when the gateway serves the portal route (HEAD /auth/ 2xx/3xx). */
export async function portalAvailable(): Promise<boolean> {
    try {
        const res = await fetch('/auth/', { method: 'HEAD' });
        if (res.status === 404 || res.status === 501) return false;
        return res.ok;
    } catch {
        return false;
    }
}

/** Redirect to the portal carrying an absolute, allowlist-safe return URL. */
export function redirectToPortal(): void {
    const here = window.location.pathname + window.location.search;
    const safe = here.startsWith('/') && !here.startsWith('//') ? here : '/';
    const redirect = `${window.location.origin}${safe}`;
    window.location.assign(`/auth/?redirect=${encodeURIComponent(redirect)}`);
}

/**
 * Exchange a one-time handoff code for the token pair. The redirect_uri must
 * match the grant minted by the portal (scheme://host/path compare).
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<CodeExchange> {
    const res = await fetch('/auth/api/code/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
    });
    if (!res.ok) {
        const err = new Error(`code exchange failed (status ${res.status})`) as Error & {
            status: number;
        };
        err.status = res.status;
        throw err;
    }
    return (await res.json()) as CodeExchange;
}

/** Read + strip ?code= from the URL (single use: gone after replaceState). */
export function consumeCodeParam(): string | null {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (!code) return null;
    url.searchParams.delete('code');
    window.history.replaceState(null, '', url.toString());
    return code;
}
