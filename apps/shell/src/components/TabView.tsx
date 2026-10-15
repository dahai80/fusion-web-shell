import { pushToast } from '@/components/ToastHost';
import { t, useLang } from '@/stores/lang';
import type { ShellTab } from '@/stores/tabs';
import { useTabs } from '@/stores/tabs';
import { useTheme } from '@/stores/theme';
import type { ModuleManifest } from '@/types/manifest';
import { type HostBridgeHandle, createHostBridge } from '@fusion/web-sdk';
import { useEffect, useRef, useState } from 'react';

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
    // Subscribe so t() re-renders on language switch.
    useLang((l) => l.lang);
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

    // Host bridge lifecycle: create per tab instance, destroy on unmount/src change.
    useEffect(() => {
        if (!tab.src || !iframeRef.current) return;
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
            proxyHttp: async (req) => {
                const res = await fetch(req.path, {
                    method: req.method,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${sessionStorage.getItem('fusion.shell.token') ?? ''}`,
                        ...(req.headers ?? {}),
                    },
                    body: req.body === undefined ? undefined : JSON.stringify(req.body),
                });
                const data = await res.json().catch(() => null);
                // A5: standardized error envelope, retryable -> toast + tab banner.
                const env = data as { message?: string; retryable?: boolean } | null;
                if (res.status >= 500 || env?.retryable) {
                    pushToast('warning', env?.message ?? `服务异常 (${res.status})`);
                    setErr(tab.id, env?.message ?? `服务异常 (${res.status})`);
                }
                return { status: res.status, data };
            },
        });
        bridgeRef.current = bridge;

        // Initial state push (module may boot after shell).
        bridge.notifyTheme(useTheme.getState().mode);
        bridge.notifyVisibility(document.visibilityState === 'visible');
        bridge.notifyLang(useLang.getState().lang);
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
    }, [tab.src, tab.id, onCrash]);

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
                <div className="text-error">
                    {t('模块加载失败，点击重试', 'Module failed to load; retry')}
                </div>
                <div className="font-mono text-xs text-text-muted">
                    {tab.crashedAt
                        ? `crashed at ${new Date(tab.crashedAt).toLocaleTimeString()}`
                        : 'iframe 已释放'}
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
            {!loaded ? (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-bg text-sm text-text-muted"
                    style={{ zIndex: 1 }}
                >
                    {t('加载中…', 'Loading…')}
                </div>
            ) : null}
            <iframe
                ref={iframeRef}
                title={tab.title}
                src={tab.src}
                onLoad={() => {
                    setLoaded(true);
                    if (timerRef.current) clearTimeout(timerRef.current);
                    console.log('[tab-view] iframe loaded:', tab.id);
                }}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
            />
        </div>
    );
}
