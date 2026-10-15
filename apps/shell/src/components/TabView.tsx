import type { ShellTab } from '@/stores/tabs';
import type { ModuleManifest } from '@/types/manifest';
import { useEffect, useRef, useState } from 'react';

const LOAD_TIMEOUT_MS = 15000;

interface Props {
    tab: ShellTab;
    manifest: ModuleManifest | undefined;
    visible: boolean;
    onCrash(tabId: string, reason: string): void;
    onReload(tabId: string): void;
}

/**
 * One module instance: per-tab same-origin iframe (PRD §7.2).
 * Crash = load timeout or unload; only this tab shows the crash card (A2/A4).
 */
export function TabView({ tab, manifest, visible, onCrash, onReload }: Props) {
    const [loaded, setLoaded] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!tab.src) return;
        setLoaded(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            if (!loaded) {
                console.warn('[tab-view] load timeout:', tab.id);
                onCrash(tab.id, 'load timeout');
            }
        }, LOAD_TIMEOUT_MS);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [tab.src, tab.id]);

    if (!manifest) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
                模块未注册: {tab.manifestId}
            </div>
        );
    }

    if (!tab.src) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg">
                <div className="text-error">模块加载失败，点击重试</div>
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
                    重试
                </button>
            </div>
        );
    }

    return (
        <div className={`h-full ${visible ? '' : 'hidden'}`} data-tab-id={tab.id}>
            {!loaded ? (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-bg text-sm text-text-muted"
                    style={{ zIndex: 1 }}
                >
                    加载中…
                </div>
            ) : null}
            <iframe
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
