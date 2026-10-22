import { pushToast } from '@/components/ToastHost';
import { useTabs } from '@/stores/tabs';

/** Gateway error envelope (A5): { code, message, module_id, retryable }. */
export interface ErrorEnvelope {
    code?: string;
    message?: string;
    module_id?: string;
    retryable?: boolean;
}

/**
 * Unified HTTP client (PRD §4.1): Bearer interceptor, 401 redirect, 403
 * graceful, retryable-envelope surfacing (toast + active tab strip).
 */

/** First-party gateway auth surfaces whose 401 means "shell session dead" (issue #28). */
function isShellAuthPath(path: string): boolean {
    return path.startsWith('/api/v1/shell/') || path.startsWith('/api/v1/password');
}
export class ApiClient {
    private tokenProvider: () => string | null;
    private onUnauthorized: () => void;
    private onForbidden: (message: string) => void;
    private base: string;

    constructor(opts: {
        tokenProvider(): string | null;
        onUnauthorized(): void;
        onForbidden?(message: string): void;
        base?: string;
    }) {
        this.tokenProvider = opts.tokenProvider;
        this.onUnauthorized = opts.onUnauthorized;
        this.onForbidden = opts.onForbidden ?? (() => undefined);
        this.base = opts.base ?? '';
    }

    async request<T>(
        path: string,
        init: RequestInit & { timeoutMs?: number; quiet?: boolean } = {}
    ): Promise<T> {
        const token = this.tokenProvider();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 15000);
        try {
            const res = await fetch(this.base + path, {
                ...init,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(init.headers ?? {}),
                },
            });
            if (res.status === 401) {
                // Issue #28: only shell's own auth surfaces mean "session dead".
                // Module API 401s (proxied iframes, notification polls, palette
                // search) route to the owning tab's error state instead — a
                // single failing module must never kick the whole shell to login.
                if (isShellAuthPath(path)) {
                    sessionStorage.removeItem('fusion.shell.token');
                    this.onUnauthorized();
                    throw Object.assign(new Error('unauthorized'), { status: 401 });
                }
                const env = (await res.json().catch(() => null)) as ErrorEnvelope | null;
                const message = env?.message ?? '模块鉴权失败 (401)';
                if (!init.quiet) {
                    console.warn('[api] module auth failed:', env?.module_id ?? path, message);
                    pushToast('warning', message);
                    const tabsState = useTabs.getState();
                    const ownerTab = env?.module_id
                        ? tabsState.tabs.find((tb) => tb.manifestId === env.module_id)?.id
                        : undefined;
                    const targetId = ownerTab ?? tabsState.activeTabId;
                    if (targetId) tabsState.setTransientError(targetId, message);
                }
                throw Object.assign(new Error(message), { status: 401, envelope: env });
            }
            if (res.status === 403) {
                const env = await res.json().catch(() => null);
                const message = (env as { message?: string } | null)?.message ?? '无权限访问该模块';
                this.onForbidden(message);
                throw Object.assign(new Error(message), { status: 403 });
            }
            if (!res.ok) {
                const env = (await res.json().catch(() => null)) as ErrorEnvelope | null;
                const message = env?.message ?? `HTTP ${res.status}`;
                // Background/quiet calls (notification polls, palette search)
                // never surface host toasts or tab error strips (review fix #2).
                if (!init.quiet) this.surfaceRetryable(env, message, res.status);
                // envelope attached so bridge proxy consumers can reuse it.
                throw Object.assign(new Error(message), { status: res.status, envelope: env });
            }
            return (await res.json()) as T;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * A5: retryable gateway errors get a toast + transient banner. The banner
     * routes to the tab owning the failing module (envelope module_id) when
     * identifiable, falling back to the active tab.
     */
    private surfaceRetryable(env: ErrorEnvelope | null, message: string, status: number): void {
        if (!env?.retryable && status < 500) return;
        console.warn('[api] retryable error:', env?.code ?? status, message);
        pushToast('warning', message);
        const tabsState = useTabs.getState();
        const ownerTab = env?.module_id
            ? tabsState.tabs.find((tb) => tb.manifestId === env.module_id)?.id
            : undefined;
        const targetId = ownerTab ?? tabsState.activeTabId;
        if (targetId) tabsState.setTransientError(targetId, message);
    }

    get<T>(path: string, opts?: { quiet?: boolean }): Promise<T> {
        return this.request<T>(path, { quiet: opts?.quiet });
    }

    post<T>(path: string, body?: unknown): Promise<T> {
        return this.request<T>(path, {
            method: 'POST',
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }

    patch<T>(path: string, body: unknown): Promise<T> {
        return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
    }

    put<T>(path: string, body: unknown): Promise<T> {
        return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
    }

    delete<T>(path: string): Promise<T> {
        return this.request<T>(path, { method: 'DELETE' });
    }
}

/** App-wide client instance. 401 handler wired in main.tsx. */
let shared: ApiClient | null = null;

export function setSharedClient(c: ApiClient): void {
    shared = c;
}

export function sharedClient(): ApiClient {
    if (!shared) throw new Error('api client not initialized');
    return shared;
}
