/** Unified HTTP client (PRD §4.1): Bearer interceptor, 401 redirect, 403 graceful. */
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

    async request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
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
                sessionStorage.removeItem('fusion.shell.token');
                this.onUnauthorized();
                throw Object.assign(new Error('unauthorized'), { status: 401 });
            }
            if (res.status === 403) {
                const env = await res.json().catch(() => null);
                const message = (env as { message?: string } | null)?.message ?? '无权限访问该模块';
                this.onForbidden(message);
                throw Object.assign(new Error(message), { status: 403 });
            }
            if (!res.ok) {
                const env = await res.json().catch(() => null);
                throw Object.assign(
                    new Error(
                        (env as { message?: string } | null)?.message ?? `HTTP ${res.status}`
                    ),
                    { status: res.status }
                );
            }
            return (await res.json()) as T;
        } finally {
            clearTimeout(timeout);
        }
    }

    get<T>(path: string): Promise<T> {
        return this.request<T>(path);
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
