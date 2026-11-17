/**
 * Software-factory deep-link entry (issue #161). The factory intake v2
 * (requirement → PRD → acceptance → payment → delivery) lives in fusion-site
 * at /factory; the shell cannot iframe it today (site CSP frame-ancestors
 * 'self' + Next absolute asset paths need a basePath to serve under
 * /shell/<id>/), so the sidebar entry hands off to the site in a new tab.
 * SSO handoff is the site's own transitional login: unauthenticated users
 * bounce through the gateway portal, where the shell session cookie
 * completes the exchange without re-entering credentials (prod same-origin;
 * dev cookie origins differ and need one portal login).
 */

export const FACTORY_SITE_URL_ENV = 'VITE_FUSION_SITE_URL';

const DEFAULT_SITE_BASE = 'https://fusion-mlx.cn';
const FACTORY_INTAKE_PATH = '/factory/new';

/** Site origin for the deep link: build-time override, else prod origin. */
export function siteBaseUrl(): string {
    let raw: string | undefined;
    try {
        raw = import.meta.env[FACTORY_SITE_URL_ENV] as string | undefined;
    } catch (err) {
        console.warn('[factoryEntry] site url env read failed', err);
    }
    if (!raw) return DEFAULT_SITE_BASE;
    const trimmed = raw.trim().replace(/\/+$/, '');
    // Only http(s) origins are valid handoff targets — anything else
    // (javascript:, data:) must never reach window.open.
    if (!/^https?:\/\//.test(trimmed)) {
        console.warn('[factoryEntry] ignoring non-http site url override');
        return DEFAULT_SITE_BASE;
    }
    return trimmed;
}

/** Factory intake v2 single-entry deep link (fusion-site /factory/new). */
export function factoryIntakeUrl(): string {
    return `${siteBaseUrl()}${FACTORY_INTAKE_PATH}`;
}
