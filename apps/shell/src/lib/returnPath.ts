/**
 * #451: the gateway bounces anonymous /shell/<module>/ navigations to
 * /login?return=<path>. Extract + validate that return target before
 * navigating: same-origin root-relative paths only — no scheme-relative
 * hosts (//evil.com), no absolute URLs, no junk.
 */
export function safeReturnPath(search: string): string | null {
    const value = new URLSearchParams(search).get('return');
    if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
    return value;
}
