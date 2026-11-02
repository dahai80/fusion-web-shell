import { t, useLang } from '@/stores/lang';
import { moduleTitle, useManifests } from '@/stores/manifests';
import type { ModuleManifest } from '@/types/manifest';
import { useState } from 'react';

/**
 * Module-unavailable page (issue #100, MT-D): graceful landing when a tab
 * opens a registered-but-offline module — the menu entry stays visible with
 * a gray dot, so clicking it must not surface a raw gateway error. Retry
 * refetches the gateway manifests (which recompute health) and re-runs the
 * entry preflight; recovery mounts the iframe in place.
 */
export function ModuleUnavailablePage({
    manifest,
    onProbed,
}: {
    manifest: ModuleManifest;
    onProbed(): void;
}) {
    const [retrying, setRetrying] = useState(false);
    const [stillDown, setStillDown] = useState(false);
    const lang = useLang((l) => l.lang);

    const retry = async () => {
        setRetrying(true);
        setStillDown(false);
        console.log('[tab-view] unavailable retry probe:', manifest.id);
        try {
            await useManifests.getState().load(true);
            const down = useManifests.getState().unreachableIds.has(manifest.id);
            setStillDown(down);
        } catch (err) {
            console.warn('[tab-view] unavailable retry failed:', manifest.id, err);
            setStillDown(true);
        } finally {
            setRetrying(false);
            onProbed();
        }
    };

    return (
        <div
            data-testid="module-unavailable"
            className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-6 text-center"
        >
            <span aria-hidden className="text-3xl">
                ⛔
            </span>
            <div className="text-sm font-medium text-text-primary">
                {t('模块暂不可用', 'Module unavailable')}
            </div>
            <div className="text-xs text-text-secondary">
                {moduleTitle(manifest, lang)} ·{' '}
                {t('服务离线或未启动', 'service offline or not started')}
            </div>
            {stillDown ? (
                <div className="text-xs text-warning">
                    {t(
                        '仍不可用，请确认模块服务已启动后重试',
                        'Still unavailable; start the module service and retry'
                    )}
                </div>
            ) : null}
            <button
                type="button"
                onClick={() => void retry()}
                disabled={retrying}
                className="rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
            >
                {retrying ? t('探测中…', 'Probing…') : t('重试', 'Retry')}
            </button>
        </div>
    );
}
