/**
 * Native-app module treatment (issue #143): modules backed by a native
 * desktop app (pure Rust renderer, no web view) cannot run in the shell
 * iframe. Their tab renders a launcher + status card instead, and the
 * launch path hands identity context to the app through its URL scheme.
 * Same spirit as the fusion-studio desktop-client treatment.
 */

/** Manifest ids backed by native apps (convention over config). */
export const NATIVE_APP_IDS: ReadonlySet<string> = new Set(['fusion-desigma']);

export function isNativeAppModule(manifestId: string): boolean {
    return NATIVE_APP_IDS.has(manifestId);
}

/** Deep link the launcher opens. desigma registers desigma:// (join links). */
export const DESIGMA_SCHEME = 'desigma://open';

/**
 * Build the launch URL. Identity context rides in the URL FRAGMENT — the
 * fragment is never sent over the wire nor logged by servers; the app reads
 * it locally. No identity token (local-login session) = plain launch.
 */
export function buildLaunchUrl(identityToken?: string | null): string {
    if (!identityToken) return DESIGMA_SCHEME;
    return `${DESIGMA_SCHEME}#identity_token=${encodeURIComponent(identityToken)}`;
}

const LAST_LAUNCH_KEY = 'fusion.desigma.lastLaunch';

/** Last-launch stamp for the status card (per browser, best effort). */
export function lastLaunchTs(): number | null {
    try {
        const raw = localStorage.getItem(LAST_LAUNCH_KEY);
        const ts = raw ? Number(raw) : Number.NaN;
        return Number.isFinite(ts) ? ts : null;
    } catch {
        return null;
    }
}

export function stampLaunch(): void {
    try {
        localStorage.setItem(LAST_LAUNCH_KEY, String(Date.now()));
    } catch (err) {
        console.warn('[nativeApps] launch stamp failed', err);
    }
}
