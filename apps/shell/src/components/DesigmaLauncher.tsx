import { DESIGMA_SCHEME, buildLaunchUrl, lastLaunchTs, stampLaunch } from '@/lib/nativeApps';
import { useAuth } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import type { ModuleManifest } from '@/types/manifest';
import { useEffect, useState } from 'react';

/**
 * Native-app launcher tab (issue #143): fusion-desigma is a pure Rust
 * renderer with no web view — the tab is a launcher + status card, not an
 * iframe. Launch hands identity context to the app via the desigma:// URL
 * scheme fragment (never sent over the wire); no token = plain launch.
 * Consistent with the fusion-studio desktop-client treatment.
 */
export function DesigmaLauncher({ manifest }: { manifest: ModuleManifest }) {
    useLang((l) => l.lang);
    const user = useAuth((s) => s.user);
    const [lastLaunch, setLastLaunch] = useState<number | null>(null);
    const [launchedNow, setLaunchedNow] = useState(false);

    useEffect(() => {
        setLastLaunch(lastLaunchTs());
    }, []);

    const identityToken = (() => {
        try {
            return sessionStorage.getItem('fusion.identity.token');
        } catch {
            return null;
        }
    })();

    const launch = () => {
        stampLaunch();
        setLastLaunch(lastLaunchTs());
        setLaunchedNow(true);
        console.log('[desigma] launching native app, identity context:', !!identityToken);
        window.location.href = buildLaunchUrl(identityToken);
    };

    return (
        <div className="flex h-full items-center justify-center bg-bg p-6">
            <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
                <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-2xl">
                        ✏️
                    </span>
                    <div>
                        <div className="text-base font-semibold text-text-primary">
                            {t(manifest.title, manifest.title_en ?? manifest.title)}
                        </div>
                        <div className="text-xs text-text-muted">
                            {t('原生桌面应用 · 自助设计', 'Native desktop app · self-design')}
                        </div>
                    </div>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-text-secondary">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-border" aria-hidden />
                        {t(
                            '应用内渲染（Rust，无 WebView）— 不嵌入 shell iframe',
                            'In-app rendering (Rust, no WebView) — cannot embed in the shell'
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span
                            className={`h-2 w-2 rounded-full ${identityToken ? 'bg-success' : 'bg-border'}`}
                            aria-hidden
                        />
                        {identityToken
                            ? t(
                                  '统一身份已绑定 — 启动时免登录传递',
                                  'Unified identity bound — passed at launch, no second login'
                              )
                            : t(
                                  '本地会话 — 应用内独立身份（无统一身份可传递）',
                                  'Local session — separate identity in-app (nothing to pass)'
                              )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-border" aria-hidden />
                        {lastLaunch
                            ? t(
                                  `上次启动 ${new Date(lastLaunch).toLocaleString()}`,
                                  `Last launched ${new Date(lastLaunch).toLocaleString()}`
                              )
                            : t('本浏览器尚未启动过', 'Never launched from this browser')}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={launch}
                    className="fs-btn fs-btn-primary mt-5 min-h-[44px] w-full"
                >
                    {t('我自己画 — 启动应用', 'Self-design — launch app')}
                </button>

                {launchedNow ? (
                    <div className="mt-3 rounded-lg border border-border bg-bg-muted px-3 py-2 text-xs text-text-muted">
                        {t(
                            `已请求打开 ${DESIGMA_SCHEME} — 若无反应，请确认已安装 fusion-desigma`,
                            `Requested ${DESIGMA_SCHEME} — if nothing opened, make sure fusion-desigma is installed`
                        )}
                    </div>
                ) : null}

                <div className="mt-3 text-center text-[11px] text-text-muted">
                    {user ? (user.display_name ?? user.user_id) : ''} · fusion-web-shell →{' '}
                    <span className="font-mono">desigma://</span>
                </div>
            </div>
        </div>
    );
}
