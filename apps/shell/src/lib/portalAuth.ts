/**
 * Unified auth portal consumption (issue #126, design doc §6/§7 P2): the
 * shell owns no auth forms long-term — login/register happen in the portal
 * served by the gateway at /auth (built in this repo as apps/auth), and the
 * shell redirects to it and returns via one-time code handoff.
 *
 * Transitional honesty: the portal backend (identity #39/#40 + gateway
 * #506) is not live yet, so every step probes first and degrades to the
 * existing local session flow instead of stranding the user on a 404.
 */

export interface CodeExchange {
    access_token?: string;
    refresh_token?: string;
}

/** True when the gateway serves the portal route (HEAD /auth < 500, non-404). */
export async function portalAvailable(): Promise<boolean> {
    try {
        const res = await fetch('/auth/', { method: 'HEAD' });
        if (res.status === 404 || res.status === 501) return false;
        return res.ok;
    } catch {
        return false;
    }
}

/** Redirect to the portal keeping a safe same-origin return path. */
export function redirectToPortal(): void {
    const here = window.location.pathname + window.location.search;
    const safe = here.startsWith('/') && !here.startsWith('//') ? here : '/';
    window.location.assign(`/auth/?return=${encodeURIComponent(safe)}`);
}

/**
 * Exchange a one-time handoff code for the token pair via the gateway
 * (contract: gateway #506, POST /api/auth/exchange). Pending routes throw
 * ApiPendingError-shaped errors with status — caller degrades.
 */
export async function exchangeCode(code: string): Promise<CodeExchange> {
    const res = await fetch('/api/auth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
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

/** Read + strip ?code= from the URL (single use: gone after refresh). */
export function consumeCodeParam(): string | null {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (!code) return null;
    url.searchParams.delete('code');
    window.history.replaceState(null, '', url.toString());
    return code;
}
