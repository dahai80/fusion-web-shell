export type DeviceMode = 'desktop' | 'mobile-ready' | 'mobile-readonly' | 'desktop-only';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

export type ThemeMode = 'dark' | 'light';

export interface HttpRequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
}

export interface HttpResult<T = unknown> {
    status: number;
    ok: boolean;
    data: T;
}

export interface ToastInput {
    level: ToastLevel;
    message: string;
    durationMs?: number;
}

export interface DeviceInfo {
    viewport: 'desktop' | 'mobile';
    mode: DeviceMode | null;
}

export interface ShellSdkOptions {
    /** Allowed parent origin. Default: same origin as the module document. */
    origin?: string;
    /** Request timeout in ms. Default 15000. */
    timeoutMs?: number;
    /** Retry attempts for failed bridge requests. Default 2. */
    retries?: number;
}

export interface FusionShellSdk {
    /** Relay an API call through the host, which attaches the Bearer token. */
    http: {
        request<T = unknown>(path: string, init?: HttpRequestInit): Promise<HttpResult<T>>;
        get<T = unknown>(path: string): Promise<HttpResult<T>>;
        post<T = unknown>(path: string, body?: unknown): Promise<HttpResult<T>>;
        put<T = unknown>(path: string, body?: unknown): Promise<HttpResult<T>>;
        delete<T = unknown>(path: string): Promise<HttpResult<T>>;
    };
    toast: {
        show(input: ToastInput): void;
    };
    tab: {
        /** Declare an active long-running task; host blocks tab close while set. */
        setActiveTask(task: { name: string } | null): void;
    };
    theme: {
        get(): ThemeMode;
        subscribe(listener: (mode: ThemeMode) => void): () => void;
    };
    devices: {
        get(): DeviceInfo;
    };
    visibility: {
        get(): boolean;
        subscribe(listener: (visible: boolean) => void): () => void;
    };
    /** Host language awareness (spec S9): t() picks zh/en copy. */
    i18n: {
        lang(): 'zh' | 'en';
        t(zh: string, en: string): string;
        subscribe(listener: (lang: 'zh' | 'en') => void): () => void;
    };
    /**
     * Session auth material for cloud-try SSO (issue #130): the identity JWT
     * minted when the shell session was created via ticket exchange. Modules
     * attach it to their LLM calls so the gateway metering middleware keys
     * the daily token quota by the user's `sub`. Null when the session was
     * created by local login or the host predates the bridge method.
     */
    auth: {
        identityToken(): Promise<string | null>;
    };
    /**
     * Effective model per the tenant policy chain (issue #114): host resolves
     * via the gateway preference endpoint (host token). Results are cached;
     * a host policy-change push invalidates the cache and notifies.
     */
    model: {
        get(moduleId?: string): Promise<string>;
        subscribe(listener: (model: string) => void): () => void;
        /**
         * Full model environment for the embedding session (issue #118):
         * module-declared capability/suggestion plus platform policy state.
         * Cached per moduleId; invalidated by the host policy-change push.
         */
        env(moduleId?: string): Promise<ShellModelInfo>;
    };
}

/** Issue #118: resolved model environment exposed to module SDKs. */
export interface ShellModelInfo {
    /** Module manifest declares model_capable. */
    modelCapable: boolean;
    /** Module manifest suggestion (schema v3). */
    suggestedModel?: string;
    /** Platform-resolved model (policy chain, issue #114). */
    platformModel?: string;
    /** Platform privacy mode; undefined while the policy API is pending. */
    privacyMode?: 'standard' | 'local_only';
    /** Tenant user allowlist; undefined while the policy API is pending. */
    allowlist?: string[];
}

/** Messages sent from module iframe to host. */
export interface ModuleRequest {
    type: 'request';
    id: string;
    method:
        | 'http'
        | 'toast'
        | 'tab'
        | 'theme'
        | 'devices'
        | 'model'
        | 'model-env'
        | 'identity-token';
    payload: unknown;
}

/** Host-to-module request (currently heartbeat ping). */
export interface HostRequest {
    type: 'request';
    id: string;
    method: 'ping';
    payload: null;
}

/** Messages sent from host to module. */
export interface HostResponse {
    type: 'response';
    id: string;
    ok: boolean;
    result?: unknown;
    /** status rides the error so modules can branch on 429 quota vs 5xx. */
    error?: { code: string; message: string; status?: number };
}

export interface HostEvent {
    type: 'event';
    event: 'theme' | 'visibility' | 'lang' | 'model-policy';
    payload: unknown;
}

export type HostMessage = HostResponse | HostEvent;
export type BridgeMessage = ModuleRequest | HostRequest | HostMessage;
