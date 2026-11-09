import { sharedClient } from '@/api/client';

/**
 * Login CAPTCHA challenge (issue #139): server-generated random-code
 * challenge in front of credential verification. Contract (gateway issue —
 * see fusion-gateway captcha issue): GET /api/v1/shell/session/captcha →
 * {captcha_id, image (data URI SVG), ttl_seconds}, single-use, session-bound
 * (cookie), ~5 min TTL, no cache. Login POST carries captcha_id + captcha_code.
 * Until the gateway ships the endpoint the login form degrades gracefully —
 * probe failure = no CAPTCHA UI, never a login blocker.
 */

export const CAPTCHA_PROBE_PATH = '/api/v1/shell/session/captcha';

export interface CaptchaChallenge {
    captchaId: string;
    imageDataUri: string;
    ttlSeconds: number;
}

/** Test seam: production default is the shared client. */
export type CaptchaGetFn = (path: string) => Promise<unknown>;

let getter: CaptchaGetFn = (path) => sharedClient().get(path, { quiet: true });

export function setCaptchaGetter(fn: CaptchaGetFn): void {
    getter = fn;
}

export interface LoginCaptchaFields {
    captcha_id: string;
    captcha_code: string;
}

/** Unambiguous charset for user entry (no 0/O/1/I/l). */
export const CAPTCHA_CHARSET_HINT = '23456789abcdefghjkmnpqrstuvwxyz';

export function parseChallenge(raw: unknown): CaptchaChallenge | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const id = typeof rec.captcha_id === 'string' ? rec.captcha_id : '';
    const image =
        typeof rec.image === 'string' && rec.image.startsWith('data:image/')
            ? rec.image
            : // Gateway #592 sends the raw SVG markup in `image` — wrap it.
              typeof rec.image === 'string' && rec.image.startsWith('<svg')
              ? `data:image/svg+xml;utf8,${encodeURIComponent(rec.image)}`
              : typeof rec.image_svg === 'string' && rec.image_svg.startsWith('<svg')
                ? `data:image/svg+xml;utf8,${encodeURIComponent(rec.image_svg)}`
                : '';
    const ttl = typeof rec.ttl_seconds === 'number' ? rec.ttl_seconds : 300;
    if (!id || !image) return null;
    return { captchaId: id, imageDataUri: image, ttlSeconds: ttl };
}

/**
 * Probe + fetch a challenge. Any failure (404 route missing, 401 gate, 5xx)
 * returns null — CAPTCHA stays off until the backend advertises it.
 */
export async function fetchCaptchaChallenge(): Promise<CaptchaChallenge | null> {
    try {
        const raw = await getter(CAPTCHA_PROBE_PATH);
        const parsed = parseChallenge(raw);
        if (!parsed) console.warn('[captcha] endpoint answered but shape unrecognized');
        return parsed;
    } catch (err) {
        console.log('[captcha] challenge endpoint not available, CAPTCHA disabled:', err);
        return null;
    }
}

/** Extract a captcha_* error code from a rejected login error, if any. */
export function isCaptchaError(err: unknown): boolean {
    const code = (err as { code?: string; envelope?: { code?: string } })?.code;
    if (typeof code === 'string' && code.startsWith('captcha_')) return true;
    const envCode = (err as { envelope?: { code?: string } })?.envelope?.code;
    return typeof envCode === 'string' && envCode.startsWith('captcha_');
}
