/**
 * SSO portal redirect_uri normalizer (issue #164). The gateway auth-portal
 * allowlist compares scheme://host/path exact strings after dropping the
 * query; origin-only values (window.location.origin) carry an EMPTY path
 * and never match the stored "http://127.0.0.1:11432/" entries — every
 * official SSO button click was rejected with "redirect_uri is not in the
 * allowlist". Normalize empty-path values to the trailing-slash form;
 * explicit paths (/login) go through untouched.
 */

export function portalRedirectUri(raw: string): string {
    try {
        const u = new URL(raw);
        // WHATWG URL normalizes an empty path to '/' — either way the
        // origin-only form must come out with the explicit trailing slash.
        if (u.pathname === '' || u.pathname === '/') return `${u.protocol}//${u.host}/`;
        return raw;
    } catch {
        console.warn('[ssoRedirect] unparseable redirect uri, passing through');
        return raw;
    }
}
