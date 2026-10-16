import { type ErrorEnvelope, sharedClient } from '@/api/client';
import { pushToast } from '@/components/ToastHost';
import { useViewport } from '@/hooks/useViewport';
import { t, useLang } from '@/stores/lang';
import { isReadonlyOnMobile } from '@/stores/manifests';
import type { ShellTab } from '@/stores/tabs';
import { useTabs } from '@/stores/tabs';
import { useTheme } from '@/stores/theme';
import type { ModuleManifest } from '@/types/manifest';
import { type HostBridgeHandle, createHostBridge } from '@fusion/web-sdk';
import { ReadOnlyBanner } from '@fusion/web-ui';
import { useCallback, useEffect, useRef, useState } from 'react';

const LOAD_TIMEOUT_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 10000;

interface Props {
    tab: ShellTab;
    manifest: ModuleManifest | undefined;
    visible: boolean;
    onCrash(tabId: string, reason: string): void;
    onReload(tabId: string): void;
}

/**
 * One module instance: per-tab same-origin iframe (PRD §7.2).
 * Crash = load timeout or heartbeat break (SDK-integrated modules only);
 * only this tab shows the crash card (A2/A4).
 *
 * Host bridge (PRD §7.2 唯一通道): relays module http/toast/tab requests,
 * attaches Bearer token, pushes theme/visibility/lang events, runs heartbeat.
 */
export function TabView({ tab, manifest, visible, onCrash, onReload }: Props) {
    const [loaded, setLoaded] = useState(false);
    // F-4: gateway HTTP-error docs (401/503 JSON) load "successfully" in an
    // iframe; preflight the entry and only mount on 2xx.
    const [entryOk, setEntryOk] = useState(false);
    // Envelope {code, message, retryable} from the failing entry probe, shown
    // on the crash card (issue #12).
    const [entryError, setEntryError] = useState<{ code?: string; message?: string } | null>(null);
    // Subscribe so t() re-renders on language switch.
    useLang((l) => l.lang);
    // #21: shell-layer device contract — mobile-readonly modules are forced
    // view-only here, not left to each module's own degradation.
    const viewport = useViewport();
    const readonly = isReadonlyOnMobile(manifest?.devices ?? [], viewport);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const bridgeRef = useRef<HostBridgeHandle | null>(null);

    // Load-timeout crash detection (works for every module, SDK or not).
    useEffect(() => {
        if (!tab.src) return;
        setLoaded(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setLoaded((wasLoaded) => {
                if (!wasLoaded) {
                    console.warn('[tab-view] load timeout:', tab.id);
                    onCrash(tab.id, 'load timeout');
                }
                return wasLoaded;
            });
        }, LOAD_TIMEOUT_MS);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [tab.src, tab.id, onCrash]);

    // Entry preflight (acceptance F-4 / PRD A4): fetch the module entry with
    // credentials before mounting. Non-200 -> per-tab crash card instead of
    // rendering the gateway error document as tab content. Cross-origin dev
    // entries (FUSION_DEV_MODULES) skip the check — CORS would false-positive.
    useEffect(() => {
        if (!tab.src) return;
        setEntryOk(false);
        let crossOrigin = false;
        try {
            crossOrigin =
                new URL(tab.src, window.location.origin).origin !== window.location.origin;
        } catch {
            crossOrigin = false;
        }
        if (crossOrigin) {
            setEntryOk(true);
            return;
        }
        let cancelled = false;
        fetch(tab.src, { credentials: 'include' })
            .then(async (res) => {
                if (cancelled) return;
                if (res.ok) {
                    setEntryError(null);
                    setEntryOk(true);
                    return;
                }
                // Gateway returns the standardized envelope on /shell/* errors;
                // render its code/message on the crash card when present.
                const env = (await res.json().catch(() => null)) as {
                    code?: string;
                    message?: string;
                } | null;
                console.warn('[tab-view] entry preflight failed:', tab.id, res.status, env?.code);
                setEntryError({
                    code: env?.code ?? `HTTP ${res.status}`,
                    message: env?.message,
                });
                pushToast(
                    'warning',
                    env?.message ??
                        t(`模块服务异常 (${res.status})`, `Module service error (${res.status})`)
                );
                onCrash(tab.id, `entry HTTP ${res.status}`);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn('[tab-view] entry preflight error:', tab.id, err);
                onCrash(tab.id, 'entry fetch failed');
            });
        return () => {
            cancelled = true;
        };
    }, [tab.src, tab.id, onCrash]);

    // Push current shell state into the module. Called at bridge creation and
    // again on iframe load: the first postMessage lands in about:blank and is
    // lost, so the module needs a re-push once its SDK is actually listening.
    const pushHostState = useCallback(() => {
        const b = bridgeRef.current;
        if (!b) return;
        b.notifyTheme(useTheme.getState().mode);
        b.notifyVisibility(document.visibilityState === 'visible');
        b.notifyLang(useLang.getState().lang);
    }, []);

    // Host bridge lifecycle: create per tab instance, destroy on unmount/src change.
    // #17: entryOk must gate AND key this effect — the first commit renders no
    // iframe (preflight pending), the effect early-returns, and without entryOk
    // in the deps it never re-runs once the iframe mounts: the bridge (message
    // listener + heartbeat) is never attached and every module bridge call
    // times out.
    useEffect(() => {
        if (!entryOk || !tab.src || !iframeRef.current) return;
        const iframeWindow = iframeRef.current.contentWindow;
        if (!iframeWindow) return;

        const setTask = useTabs.getState().setActiveTask;
        const setErr = useTabs.getState().setTransientError;
        const bridge = createHostBridge(tab.id, iframeWindow, {
            getToken: () => sessionStorage.getItem('fusion.shell.token') ?? null,
            onToast: (input) => {
                const level = (['info', 'success', 'warning', 'error'] as const).includes(
                    input.level as 'info'
                )
                    ? (input.level as 'info' | 'success' | 'warning' | 'error')
                    : 'info';
                pushToast(level, input.message, input.durationMs);
            },
            onActiveTask: (_tabId, task) => setTask(tab.id, task !== null),
            // Reuse the shared ApiClient: same Bearer injection, 401 session
            // handling and A5 envelope logic as the shell's own calls.
            proxyHttp: async (req) => {
                try {
                    const data = await sharedClient().request(req.path, {
                        method: req.method,
                        headers: req.headers,
                        body: req.body === undefined ? undefined : JSON.stringify(req.body),
                    });
                    return { status: 200, data };
                } catch (err) {
                    const status = (err as { status?: number }).status ?? 500;
                    const env = (err as { envelope?: ErrorEnvelope }).envelope;
                    const message = (err as Error).message || `HTTP ${status}`;
                    if (status >= 500 || env?.retryable) {
                        pushToast('warning', message);
                        setErr(tab.id, message);
                    }
                    return { status, data: env ?? { message } };
                }
            },
        });
        bridgeRef.current = bridge;
        pushHostState();

        bridge.startHeartbeat(
            (alive) => {
                if (!alive) onCrash(tab.id, 'heartbeat lost');
            },
            HEARTBEAT_INTERVAL_MS,
            HEARTBEAT_TIMEOUT_MS
        );

        // Theme / visibility / lang propagation to this tab's module.
        const onTheme = (e: Event) =>
            bridge.notifyTheme((e as CustomEvent<string>).detail as 'dark' | 'light');
        const onLang = (e: Event) => bridge.notifyLang((e as CustomEvent<string>).detail);
        const onVis = () => bridge.notifyVisibility(document.visibilityState === 'visible');
        window.addEventListener('fusion:theme', onTheme);
        window.addEventListener('fusion:lang', onLang);
        document.addEventListener('visibilitychange', onVis);

        return () => {
            window.removeEventListener('fusion:theme', onTheme);
            window.removeEventListener('fusion:lang', onLang);
            document.removeEventListener('visibilitychange', onVis);
            bridge.stopHeartbeat();
            bridge.destroy();
            bridgeRef.current = null;
        };
    }, [entryOk, tab.src, tab.id, onCrash, pushHostState]);

    if (!manifest) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                {t('模块未注册', 'Module not registered')}: {tab.manifestId}
            </div>
        );
    }

    if (!tab.src) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg">
                <div className="text-sm text-text-secondary">
                    {t('模块', 'Module')}: {manifest.title}
                </div>
                <div className="text-error">
                    {t('模块加载失败，点击重试', 'Module failed to load; retry')}
                </div>
                {entryError ? (
                    <div className="max-w-md rounded-md border border-border bg-bg-elevated px-4 py-3 text-xs">
                        <div className="font-mono text-text-secondary">code: {entryError.code}</div>
                        {entryError.message ? (
                            <div className="mt-1 text-text-primary">{entryError.message}</div>
                        ) : null}
                    </div>
                ) : null}
                <div className="font-mono text-xs text-text-muted">
                    {tab.crashedAt
                        ? `crashed at ${new Date(tab.crashedAt).toLocaleTimeString()}`
                        : t('iframe 已释放', 'iframe released')}
                </div>
                <button
                    type="button"
                    onClick={() => onReload(tab.id)}
                    className="rounded-md bg-brand px-4 py-2 text-sm text-white"
                >
                    {t('重试', 'Retry')}
                </button>
            </div>
        );
    }

    return (
        <div className={`h-full ${visible ? '' : 'hidden'}`} data-tab-id={tab.id}>
            {tab.transientError ? (
                <div className="flex items-center justify-between border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
                    <span className="truncate">{tab.transientError}</span>
                    <button
                        type="button"
                        onClick={() => useTabs.getState().setTransientError(tab.id, null)}
                        className="ml-2 shrink-0"
                    >
                        ✕
                    </button>
                </div>
            ) : null}
            {!loaded || !entryOk ? (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-bg text-sm text-text-muted"
                    style={{ zIndex: 1 }}
                >
                    {t('加载中…', 'Loading…')}
                </div>
            ) : null}
            {readonly ? (
                <div className="absolute inset-x-0 top-0" style={{ zIndex: 2 }}>
                    <ReadOnlyBanner text={t('只读模式（移动端）', 'Read-only (mobile)')} />
                </div>
            ) : null}
            {entryOk ? (
                <iframe
                    ref={iframeRef}
                    title={tab.title}
                    src={tab.src}
                    onLoad={() => {
                        setLoaded(true);
                        if (timerRef.current) clearTimeout(timerRef.current);
                        pushHostState();
                        console.log('[tab-view] iframe loaded:', tab.id);
                    }}
                    className={`h-full w-full border-0 ${readonly ? 'pointer-events-none' : ''}`}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
                />
            ) : null}
        </div>
    );
}
