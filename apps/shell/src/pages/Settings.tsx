import { pushToast } from '@/components/ToastHost';
import { useKeys } from '@/stores/keys';
import type { ApiKeyRow, IssuedKey, ScopeRow } from '@/stores/keys';
import { flattenScopes, scopeMatrix } from '@/stores/keys';
import { t } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@fusion/web-ui';
import { useEffect, useMemo, useState } from 'react';

/**
 * Settings page (issue #35): self-serve API keys — create with a
 * manifest-driven scope matrix, one-time plaintext reveal, rotate with
 * grace-window notice, revoke with confirmation, usage surface (tail4 +
 * last-used + recent calls). Degrades to a gateway-pending notice until the
 * gateway ships K2 (fusion-gateway#262) instead of an error wall.
 */
export function SettingsPage() {
    const items = useKeys((s) => s.items);
    const loading = useKeys((s) => s.loading);
    const error = useKeys((s) => s.error);
    const gatewayPending = useKeys((s) => s.gatewayPending);
    const refresh = useKeys((s) => s.refresh);
    const manifests = useManifests((s) => s.manifests);
    const [name, setName] = useState('');
    const [rows, setRows] = useState<ScopeRow[]>([]);
    const [issued, setIssued] = useState<IssuedKey | null>(null);
    const [rotateTarget, setRotateTarget] = useState<ApiKeyRow | null>(null);
    const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Re-derive the scope matrix when manifests change; keep user checks.
    useEffect(() => {
        setRows((prev) => {
            const next = scopeMatrix(manifests);
            const prevByModule = new Map(prev.map((r) => [r.moduleId, r]));
            for (const row of next) {
                const old = prevByModule.get(row.moduleId);
                if (!old) continue;
                for (const cell of row.actions) {
                    cell.checked =
                        old.actions.find((a) => a.action === cell.action)?.checked ?? false;
                }
            }
            return next;
        });
    }, [manifests]);

    const selectedScopes = useMemo(() => flattenScopes(rows), [rows]);

    const onCreate = async () => {
        if (!name.trim() || selectedScopes.length === 0 || busy) return;
        setBusy(true);
        try {
            const res = await useKeys.getState().create(name.trim(), selectedScopes);
            setName('');
            setRows(scopeMatrix(manifests));
            setIssued(res);
            console.log('[settings] key created, plaintext shown once');
        } catch (err) {
            pushToast('error', (err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const onRotate = async () => {
        if (!rotateTarget) return;
        const res = await useKeys.getState().rotate(rotateTarget.key_id);
        setRotateTarget(null);
        if (res) setIssued(res);
        else pushToast('error', t('轮换失败', 'Rotation failed'));
    };

    const onRevoke = async () => {
        if (!revokeTarget) return;
        try {
            await useKeys.getState().revoke(revokeTarget.key_id);
        } catch (err) {
            pushToast('error', (err as Error).message);
        }
        setRevokeTarget(null);
    };

    return (
        <div className="mx-auto max-w-3xl p-4">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <div className="text-lg text-text-primary">{t('设置', 'Settings')}</div>
                    <div className="text-xs text-text-muted">
                        {t(
                            'API 密钥：申请、轮换、吊销与用量',
                            'API keys: apply, rotate, revoke, usage'
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => window.location.assign('/')}
                        className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary"
                    >
                        {t('← 返回', '← Back')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary"
                    >
                        {t('刷新', 'Refresh')}
                    </button>
                </div>
            </div>

            {gatewayPending ? (
                <div className="mb-4 rounded-card border border-border bg-bg-elevated px-4 py-3 text-sm text-text-secondary">
                    {t(
                        '网关尚未提供密钥服务（K2 待上线，fusion-gateway#262）。页面将在服务就绪后自动可用。',
                        'The gateway does not expose the key service yet (K2 pending, fusion-gateway#262). This page becomes usable once it ships.'
                    )}
                </div>
            ) : null}

            <div className="mb-6 rounded-card border border-border bg-bg-elevated p-4">
                <div className="text-sm text-text-primary">{t('申请新密钥', 'Create new key')}</div>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('密钥名称，如 ci-deploy', 'Key name, e.g. ci-deploy')}
                    className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                />
                <div className="mt-3 max-h-56 overflow-y-auto">
                    {rows.map((row) => (
                        <div
                            key={row.moduleId}
                            className="flex min-h-[36px] flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/40 py-1.5 last:border-0"
                        >
                            <span className="min-w-32 text-sm text-text-primary">
                                {row.moduleTitle}
                                <span className="ml-2 font-mono text-xs text-text-muted">
                                    {row.moduleId}
                                </span>
                            </span>
                            {row.actions.map((cell) => (
                                <label
                                    key={cell.action}
                                    className="flex items-center gap-1.5 text-xs text-text-secondary"
                                >
                                    <input
                                        type="checkbox"
                                        checked={cell.checked}
                                        onChange={() => {
                                            cell.checked = !cell.checked;
                                            setRows([...rows]);
                                        }}
                                    />
                                    {cell.action}
                                </label>
                            ))}
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    disabled={!name.trim() || selectedScopes.length === 0 || busy}
                    onClick={() => void onCreate()}
                    className="mt-3 rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                    {t('创建密钥', 'Create key')}
                    {selectedScopes.length > 0
                        ? ` (${selectedScopes.length} ${t('个权限', 'scopes')})`
                        : ''}
                </button>
            </div>

            <div className="text-sm text-text-primary">{t('我的密钥', 'My keys')}</div>
            <div className="mt-2">
                {loading ? (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : null}
                {!loading && error ? (
                    <ErrorState message={error} onRetry={() => void refresh()} />
                ) : null}
                {!loading && !error && !gatewayPending && items.length === 0 ? (
                    <EmptyState
                        title={t('暂无密钥', 'No keys yet')}
                        description={t(
                            '创建一个密钥用于脚本或 CI 调用 Fusion API',
                            'Create a key for scripts or CI to call the Fusion API'
                        )}
                    />
                ) : null}
                {!loading && !error && items.length > 0 ? (
                    <div className="overflow-hidden rounded-card border border-border bg-bg-elevated">
                        {items.map((k) => (
                            <div
                                key={k.key_id}
                                className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-0"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm text-text-primary">
                                        {k.name}
                                        <span className="ml-2 rounded-full bg-bg-muted px-2 font-mono text-xs text-text-muted">
                                            fk-…{k.tail4}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap gap-1">
                                        {k.scopes.map((sc) => (
                                            <span
                                                key={sc}
                                                className="rounded bg-brand/10 px-1.5 text-xs text-brand"
                                            >
                                                {sc}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-0.5 text-xs text-text-muted">
                                        {t('创建于', 'Created')} {k.created_at.slice(0, 10)}
                                        {' · '}
                                        {k.last_used_at
                                            ? `${t('最近使用', 'Last used')} ${k.last_used_at.slice(0, 10)}`
                                            : t('从未使用', 'Never used')}
                                        {` · ${t('近 24h 调用', 'Calls (24h)')}: ${k.recent_calls}`}
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRotateTarget(k)}
                                        className="rounded-md border border-border px-3 py-1.5 text-xs text-text-primary"
                                    >
                                        {t('轮换', 'Rotate')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRevokeTarget(k)}
                                        className="rounded-md border border-error/60 px-3 py-1.5 text-xs text-error"
                                    >
                                        {t('吊销', 'Revoke')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {issued ? <PlaintextDialog issued={issued} onClose={() => setIssued(null)} /> : null}
            <ConfirmDialog
                open={rotateTarget !== null}
                danger
                title={t(
                    `轮换密钥 ${rotateTarget?.name ?? ''}`,
                    `Rotate key ${rotateTarget?.name ?? ''}`
                )}
                description={t(
                    '旧密钥将在宽限期后失效。轮换会生成新密钥，仅在此时显示一次。',
                    'The old key stops working after a grace window. Rotation issues a new key, shown exactly once.'
                )}
                confirmLabel={t('轮换', 'Rotate')}
                onCancel={() => setRotateTarget(null)}
                onConfirm={() => void onRotate()}
            />
            <ConfirmDialog
                open={revokeTarget !== null}
                danger
                title={t(
                    `吊销密钥 ${revokeTarget?.name ?? ''}`,
                    `Revoke key ${revokeTarget?.name ?? ''}`
                )}
                description={t(
                    '吊销立即生效，使用该密钥的调用将全部失败，不可恢复。',
                    'Revocation is immediate and irreversible; all calls with this key will fail.'
                )}
                confirmLabel={t('吊销', 'Revoke')}
                onCancel={() => setRevokeTarget(null)}
                onConfirm={() => void onRevoke()}
            />
        </div>
    );
}

function PlaintextDialog({ issued, onClose }: { issued: IssuedKey; onClose(): void }) {
    const [copied, setCopied] = useState(false);
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-md rounded-card border border-border bg-bg-elevated p-4">
                <div className="text-base text-text-primary">
                    {t('密钥已创建（仅显示一次）', 'Key created (shown once)')}
                </div>
                <div className="mt-2 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm break-all text-text-primary">
                    {issued.plaintext}
                </div>
                <div className="mt-2 text-xs text-warning">
                    {t(
                        '请立即复制保存：关闭后将无法再次查看，也不会存储在服务端。',
                        'Copy it now: after closing, it can never be shown again and is not stored server-side.'
                    )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            void navigator.clipboard
                                .writeText(issued.plaintext)
                                .then(() => {
                                    setCopied(true);
                                    console.log('[settings] plaintext copied to clipboard');
                                })
                                .catch((err) => {
                                    console.warn('[settings] clipboard copy failed', err);
                                    pushToast('error', t('复制失败', 'Copy failed'));
                                });
                        }}
                        className="rounded-md border border-border px-4 py-2 text-sm text-text-primary"
                    >
                        {copied ? t('已复制', 'Copied') : t('复制', 'Copy')}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md bg-brand px-4 py-2 text-sm text-white"
                    >
                        {t('我已保存', 'Saved')}
                    </button>
                </div>
            </div>
        </div>
    );
}
