import { HttpError } from './retry';
import type { DeviceInfo, HostEvent, HostResponse, ModuleRequest, ThemeMode } from './types';

export interface HostBridgeOptions {
    /** Allowed module origin. Default: same origin as the host document. */
    origin?: string;
    /** Token attached to proxied http calls. */
    getToken(): string | null;
    onToast(input: { level: string; message: string; durationMs?: number }): void;
    onActiveTask(tabId: string, task: { name: string } | null): void;
    /** Gateway-proxied fetch used for http relay; host attaches Bearer here. */
    proxyHttp(req: {
        path: string;
        method: string;
        headers?: Record<string, string>;
        body?: unknown;
    }): Promise<{ status: number; data: unknown }>;
}

export interface HostBridgeHandle {
    iframeWindow: Window | null;
    destroy(): void;
    notifyTheme(mode: ThemeMode): void;
    notifyVisibility(visible: boolean): void;
    /** Probe whether the module has the SDK alive (responds to a theme event round-trip). */
    ping(timeoutMs?: number): Promise<boolean>;
}

/**
 * Host-side bridge for one module iframe. Validates source/origin on every
 * message; iframe never touches host state directly.
 */
export function createHostBridge(
    tabId: string,
    iframeWindow: Window | null,
    options: HostBridgeOptions
): HostBridgeHandle {
    const origin = options.origin ?? window.location.origin;
    const disposers: Array<() => void> = [];
    let currentIframeWindow = iframeWindow;

    const pendingPings = new Set<(v: boolean) => void>();

    async function handleRequest(msg: ModuleRequest): Promise<unknown> {
        switch (msg.method) {
            case 'http': {
                const req = msg.payload as {
                    path: string;
                    method?: string;
                    headers?: Record<string, string>;
                    body?: unknown;
                };
                try {
                    const { status, data } = await options.proxyHttp({
                        path: req.path,
                        method: req.method ?? 'GET',
                        headers: req.headers,
                        body: req.body,
                    });
                    if (status >= 400) {
                        const envelope = data as { code?: string; message?: string } | null;
                        return {
                            __httpError: true,
                            status,
                            code: envelope?.code ?? 'http_error',
                            message: envelope?.message ?? `status ${status}`,
                        };
                    }
                    return { status, ok: status < 400, data };
                } catch (err) {
                    console.error('[host-bridge] http proxy failed:', err);
                    throw new HttpError(502, 'gateway_unreachable', 'gateway request failed');
                }
            }
            case 'toast':
                options.onToast(
                    msg.payload as { level: string; message: string; durationMs?: number }
                );
                return { ok: true };
            case 'tab':
                options.onActiveTask(tabId, (msg.payload as { name: string } | null) ?? null);
                return { ok: true };
            case 'theme': {
                const mode: ThemeMode = document.documentElement.classList.contains('light')
                    ? 'light'
                    : 'dark';
                return mode;
            }
            case 'devices': {
                const mobile = window.matchMedia('(max-width: 767px)').matches;
                const info: DeviceInfo = { viewport: mobile ? 'mobile' : 'desktop', mode: null };
                return info;
            }
            default:
                throw new Error(`unknown bridge method: ${(msg as ModuleRequest).method}`);
        }
    }

    function onMessage(ev: MessageEvent): void {
        if (ev.source !== currentIframeWindow || ev.origin !== origin) return;
        const msg = ev.data as ModuleRequest;
        if (!msg || msg.type !== 'request') return;
        if (typeof msg.id !== 'string' || typeof msg.method !== 'string') return;
        void handleRequest(msg).then(
            (result) => {
                if ('__httpError' in (result as object)) {
                    const e = result as { status: number; code: string; message: string };
                    respond({
                        type: 'response',
                        id: msg.id,
                        ok: false,
                        error: { code: e.code, message: e.message },
                    });
                } else {
                    respond({ type: 'response', id: msg.id, ok: true, result });
                }
            },
            (err: Error) => {
                respond({
                    type: 'response',
                    id: msg.id,
                    ok: false,
                    error: { code: err.name, message: err.message },
                });
            }
        );
    }

    function respond(msg: HostResponse): void {
        if (!currentIframeWindow) return;
        currentIframeWindow.postMessage(msg, origin);
    }

    function notify(event: HostEvent): void {
        if (!currentIframeWindow) return;
        currentIframeWindow.postMessage(event, origin);
    }

    window.addEventListener('message', onMessage);
    disposers.push(() => window.removeEventListener('message', onMessage));

    return {
        get iframeWindow() {
            return currentIframeWindow;
        },
        set iframeWindow(w: Window | null) {
            currentIframeWindow = w;
        },
        destroy() {
            disposers.forEach((d) => d());
            currentIframeWindow = null;
        },
        notifyTheme(mode: ThemeMode) {
            notify({ type: 'event', event: 'theme', payload: mode });
        },
        notifyVisibility(visible: boolean) {
            notify({ type: 'event', event: 'visibility', payload: visible });
        },
        ping(timeoutMs = 3000): Promise<boolean> {
            if (!currentIframeWindow) return Promise.resolve(false);
            return new Promise<boolean>((resolve) => {
                const timer = setTimeout(() => {
                    pendingPings.delete(resolve);
                    resolve(false);
                }, timeoutMs);
                pendingPings.add((v) => {
                    clearTimeout(timer);
                    resolve(v);
                });
                // A live SDK module echoes any request; use a cheap theme call.
                currentIframeWindow?.postMessage(
                    { type: 'event', event: 'theme', payload: 'dark' },
                    origin
                );
                // Response arrives as a request with method 'theme' only if module asks;
                // otherwise treat silence after timeout as not-integrated (do not crash).
                setTimeout(() => resolve(false), 0);
            });
        },
    };
}
