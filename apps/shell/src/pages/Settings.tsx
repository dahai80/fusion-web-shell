import * as api from '@/api/endpoints';
import { isGatewayPending } from '@/api/endpoints';
import { pushToast } from '@/components/ToastHost';
import { navigateShell } from '@/lib/adminRoute';
import { guardedLoad } from '@/lib/pendingSurfaces';
import {
    type AdapterRow,
    type ConnectorRow,
    SYNC_EXAMPLE,
    formatAdminError,
    parseJsonInput,
    sanitizeAdapters,
    sanitizeConnectors,
} from '@/lib/settingsOps';
import { useAuth } from '@/stores/auth';
import { useKeys } from '@/stores/keys';
import type { ApiKeyRow, IssuedKey, ScopeRow } from '@/stores/keys';
import { flattenScopes, scopeMatrix } from '@/stores/keys';
import { t } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@fusion/web-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Settings page (issue #35): self-serve API keys — create with a
 * manifest-driven scope matrix, one-time plaintext reveal, rotate with
 * grace-window notice, revoke with confirmation, usage surface (tail4 +
 * last-used + recent calls). Degrades to a gateway-pending notice until the
 * gateway ships K2 (fusion-gateway#262) instead of an error wall.
 */
export function SettingsPage() {
    const roles = useAuth((s) => s.user?.roles ?? []);
    const isAdmin = roles.includes('admin') || roles.includes('ops_lead');
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
        const res = await useKeys.getState().rotate(rotateTarget.name);
        setRotateTarget(null);
        if (res) setIssued(res);
        else pushToast('error', t('轮换失败', 'Rotation failed'));
    };

    const onRevoke = async () => {
        if (!revokeTarget) return;
        try {
            await useKeys.getState().revoke(revokeTarget.name);
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
                        onClick={() => navigateShell('/')}
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
                        '网关尚未提供会话级密钥服务（fusion-gateway#271 待上线）。服务就绪后本页自动可用。',
                        'The gateway does not expose the session-gated key service yet (fusion-gateway#271). This page becomes usable once it ships.'
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
                                key={k.name}
                                className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 last:border-0"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm text-text-primary">
                                        {k.name}
                                        <span className="ml-2 rounded-full bg-bg-muted px-2 font-mono text-xs text-text-muted">
                                            {k.key_prefix}
                                        </span>
                                        {k.status !== 'active' ? (
                                            <span className="ml-2 rounded-full bg-bg-muted px-2 text-xs text-offline">
                                                {k.status}
                                            </span>
                                        ) : null}
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
                                        {t('更新于', 'Updated')} {k.updated_at.slice(0, 10)}
                                        {k.quota_limit > 0
                                            ? ` · ${t('用量', 'Usage')}: ${k.quota_used}/${k.quota_limit}`
                                            : ''}
                                    </div>
                                </div>
                                {k.status === 'active' ? (
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
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {isAdmin ? (
                <>
                    <PlatformAdaptersSection />
                    <ConnectorsSection />
                    <PolicyOverridesSection />
                </>
            ) : (
                <div className="mt-6 rounded-card border border-border bg-bg-elevated px-4 py-3 text-xs text-text-muted">
                    {t(
                        '平台适配器 / 第三方连接器 / 策略覆盖需要 ops_lead 或管理员角色。',
                        'Platform adapters / connectors / policy overrides require the ops_lead or admin role.'
                    )}
                </div>
            )}

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

// SECTION: platform adapters (migration E6, f-ecommerce settings.html)

function SectionMsg({ msg, ok }: { msg: string; ok: boolean }) {
    if (!msg) return null;
    return (
        <p className={`mt-2 text-xs ${ok ? 'text-success' : 'text-error'}`} role="status">
            {msg}
        </p>
    );
}

function PendingNote() {
    return (
        <div className="rounded-card border border-border bg-bg-muted px-4 py-3 text-xs text-text-secondary">
            {t(
                '网关尚未提供该管理面（契约见 docs/f-ecommerce-migration-e6.md）。服务就绪后本区自动可用。',
                'The gateway does not expose this admin surface yet (contract in docs/f-ecommerce-migration-e6.md). It becomes usable once it ships.'
            )}
        </div>
    );
}

function PlatformAdaptersSection() {
    const [rows, setRows] = useState<AdapterRow[]>([]);
    const [pending, setPending] = useState(false);
    const [msg, setMsg] = useState('');
    const [ok, setOk] = useState(true);
    const [platform, setPlatform] = useState('');
    const [credentials, setCredentials] = useState('');
    const [rate, setRate] = useState('2.0');
    const [jitter, setJitter] = useState('200');
    const [enabled, setEnabled] = useState(true);

    const reload = useCallback(() => {
        // Issue #46: one 404 marks the surface pending for the session —
        // later reloads short-circuit, no repeat console/network noise.
        guardedLoad('adapters', () => api.listAdapters())
            .then((r) => {
                if (r.pending) {
                    setPending(true);
                    return;
                }
                setRows(sanitizeAdapters(r.data));
                setPending(false);
            })
            .catch((err) => console.warn('[settings] adapters list failed', err));
    }, []);
    useEffect(() => {
        reload();
    }, [reload]);

    const save = () => {
        const parsed = parseJsonInput(credentials);
        if (!parsed.ok) {
            setOk(false);
            setMsg(t('凭据必须是 JSON', 'Credentials must be JSON'));
            return;
        }
        if (!platform.trim()) {
            setOk(false);
            setMsg(t('平台名不能为空。', 'Platform name is required.'));
            return;
        }
        api.saveAdapter(platform.trim(), {
            credentials: parsed.value as Record<string, string>,
            rate_limit_rps: Number.parseFloat(rate) || 0,
            jitter_ms: Number.parseInt(jitter, 10) || 0,
            enabled,
        })
            .then(() => {
                setOk(true);
                setMsg(t('已保存（加密存储）。', 'Saved (encrypted).'));
                console.log('[settings] adapter saved (encrypted):', platform);
                reload();
            })
            .catch((err) => {
                setOk(false);
                setMsg(
                    isGatewayPending(err)
                        ? t('网关面未上线。', 'Gateway surface not shipped yet.')
                        : formatAdminError(err) ||
                              t(
                                  '保存失败（仅 ops_lead/管理员）。',
                                  'Save failed (ops_lead/admin only).'
                              )
                );
            });
    };

    const test = (p: string) => {
        api.testAdapter(p)
            .then((d) => {
                const r = d as { ok?: boolean; reason?: string; error_code?: string };
                setOk(r.ok === true);
                setMsg(
                    `${p}: ${r.ok ? t('可达', 'reachable') : t('失败 — ', 'failed — ') + (r.reason || r.error_code || '')}`
                );
                reload();
            })
            .catch((err) => {
                setOk(false);
                setMsg(
                    `${p}: ${t('失败 — ', 'failed — ')}${formatAdminError(err) || t('测试请求失败', 'test request failed')}`
                );
            });
    };

    return (
        <section className="mt-6">
            <h2 className="text-sm font-medium text-text-primary">
                {t('平台适配器', 'Platform Adapters')}{' '}
                <span className="font-normal text-text-muted">
                    {t('加密凭据保险库', 'encrypted credential vault')}
                </span>
            </h2>
            <p className="mt-1 text-xs text-text-muted">
                {t(
                    '凭据加密存储，页面只显示掩码投影；测试按钮验证连通性。',
                    'Credentials are encrypted at rest; the page shows only the masked projection. Use Test to verify reachability.'
                )}
            </p>
            {pending ? (
                <div className="mt-2">
                    <PendingNote />
                </div>
            ) : (
                <>
                    <div className="mt-2 overflow-x-auto rounded-card border border-border bg-bg-elevated">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-border text-text-secondary">
                                <tr>
                                    <th className="px-3 py-2">{t('平台', 'Platform')}</th>
                                    <th className="px-3 py-2">{t('已配置', 'Configured')}</th>
                                    <th className="px-3 py-2">{t('启用', 'Enabled')}</th>
                                    <th className="px-3 py-2">
                                        {t('凭据（掩码）', 'Credentials')}
                                    </th>
                                    <th className="px-3 py-2">{t('限速 (rps)', 'Rate (rps)')}</th>
                                    <th className="px-3 py-2">{t('抖动 (ms)', 'Jitter (ms)')}</th>
                                    <th className="px-3 py-2">{t('测试', 'Test')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((a) => (
                                    <tr
                                        key={a.platform}
                                        className="border-b border-border/40 last:border-0"
                                    >
                                        <td className="px-3 py-2 font-medium text-text-primary">
                                            {a.platform}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Badge
                                                ok={a.configured}
                                                on={t('是', 'yes')}
                                                off={t('否', 'no')}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <Badge
                                                ok={a.enabled}
                                                on={t('开', 'on')}
                                                off={t('关', 'off')}
                                            />
                                        </td>
                                        <td className="max-w-48 truncate px-3 py-2 font-mono text-text-muted">
                                            {JSON.stringify(a.credentials_masked)}
                                        </td>
                                        <td className="px-3 py-2">{a.rate_limit_rps}</td>
                                        <td className="px-3 py-2">{a.jitter_ms}</td>
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => test(a.platform)}
                                                className="rounded-md border border-border px-2 py-1 text-text-primary hover:border-brand"
                                            >
                                                {t('测试', 'Test')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-3 text-text-muted">
                                            {t('暂无适配器配置', 'No adapters configured')}
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    <details className="mt-2 rounded-card border border-border bg-bg-elevated px-4 py-3">
                        <summary className="cursor-pointer text-sm text-text-primary">
                            {t('配置适配器凭据', 'Configure adapter credentials')}
                        </summary>
                        <div className="mt-3 flex flex-col gap-2">
                            <input
                                value={platform}
                                onChange={(e) => setPlatform(e.target.value)}
                                placeholder={t('平台 ID，如 shopify', 'Platform id, e.g. shopify')}
                                className="w-64 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                            />
                            <textarea
                                value={credentials}
                                onChange={(e) => setCredentials(e.target.value)}
                                placeholder='{"access_token": "..."} — JSON, stored encrypted'
                                className="h-20 w-full max-w-xl resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary"
                            />
                            <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                                <label>
                                    {t('限速', 'Rate')}{' '}
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={rate}
                                        onChange={(e) => setRate(e.target.value)}
                                        className="w-20 rounded-md border border-border bg-bg px-2 py-1"
                                    />{' '}
                                    rps
                                </label>
                                <label>
                                    {t('抖动', 'Jitter')}{' '}
                                    <input
                                        type="number"
                                        value={jitter}
                                        onChange={(e) => setJitter(e.target.value)}
                                        className="w-20 rounded-md border border-border bg-bg px-2 py-1"
                                    />{' '}
                                    ms
                                </label>
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(e) => setEnabled(e.target.checked)}
                                    />
                                    {t('启用', 'enabled')}
                                </label>
                                <button
                                    type="button"
                                    onClick={save}
                                    className="rounded-md bg-brand px-3 py-1.5 text-white"
                                >
                                    {t('保存（加密）', 'Save (encrypted)')}
                                </button>
                            </div>
                            <SectionMsg msg={msg} ok={ok} />
                        </div>
                    </details>
                </>
            )}
        </section>
    );
}

function Badge({ ok, on, off }: { ok: boolean; on: string; off: string }) {
    return (
        <span
            className={`rounded-full px-2 py-0.5 text-xs ${ok ? 'bg-success/15 text-success' : 'bg-bg-muted text-text-muted'}`}
        >
            {ok ? on : off}
        </span>
    );
}

// SECTION: connectors (migration E6, f-ecommerce settings.html)

function ConnectorsSection() {
    const [rows, setRows] = useState<ConnectorRow[]>([]);
    const [pending, setPending] = useState(false);
    const [id, setId] = useState('');
    const [doc, setDoc] = useState('');
    const [msg, setMsg] = useState('');
    const [ok, setOk] = useState(true);

    const reload = useCallback(() => {
        guardedLoad('connectors', () => api.listConnectors())
            .then((r) => {
                if (r.pending) {
                    setPending(true);
                    return;
                }
                setRows(sanitizeConnectors(r.data));
                setPending(false);
            })
            .catch((err) => console.warn('[settings] connectors list failed', err));
    }, []);
    useEffect(() => {
        reload();
    }, [reload]);

    const save = () => {
        const parsed = parseJsonInput(doc, { requireNonEmpty: true });
        if (!parsed.ok) {
            setOk(false);
            setMsg(t('连接器文档必须是合法 JSON', 'Connector document must be valid JSON'));
            return;
        }
        if (!id.trim()) {
            setOk(false);
            setMsg(t('连接器 ID 不能为空。', 'Connector id is required.'));
            return;
        }
        api.saveConnector(id.trim(), parsed.value)
            .then((d) => {
                const r = d as { saved?: boolean; problems?: string[]; detail?: string };
                setOk(r.saved === true);
                setMsg(
                    r.saved
                        ? t('连接器已保存。', 'Connector saved.')
                        : (r.problems ?? [r.detail ?? t('保存失败。', 'Save failed.')]).join('; ')
                );
                reload();
            })
            .catch((err) => {
                setOk(false);
                setMsg(
                    isGatewayPending(err)
                        ? t('网关面未上线。', 'Gateway surface not shipped yet.')
                        : formatAdminError(err) ||
                              t(
                                  '保存失败（仅 ops_lead/管理员）。',
                                  'Save failed (ops_lead/admin only).'
                              )
                );
            });
    };

    const test = (cid: string, operation?: string) => {
        api.testConnector(cid, operation)
            .then((d) => {
                const r = d as {
                    ok?: boolean;
                    operation?: string;
                    duration_ms?: number;
                    detail?: string;
                    reason?: string;
                    error_code?: string;
                };
                setOk(r.ok === true);
                setMsg(
                    r.ok
                        ? `${r.operation}: ok (${r.duration_ms ?? '?'}ms)`
                        : r.detail || r.reason || r.error_code || t('测试失败', 'test failed')
                );
            })
            .catch((err) => {
                setOk(false);
                setMsg(formatAdminError(err) || t('测试请求失败', 'test request failed'));
            });
    };

    return (
        <section className="mt-6">
            <h2 className="text-sm font-medium text-text-primary">
                {t('第三方连接器', 'Third-Party Connectors')}{' '}
                <span className="font-normal text-text-muted">
                    {t(
                        'config-first 接入（REST+JSON / webhook）',
                        'config-first onboarding (REST+JSON / webhook)'
                    )}
                </span>
            </h2>
            <p className="mt-1 text-xs text-text-muted">
                {t(
                    '连接器 JSON 使 REST+JSON 第三方无需写代码即可接入。通过下方编辑器上传。',
                    'A connector JSON makes a REST+JSON third party onboardable without code. Upload via the editor below.'
                )}
            </p>
            {pending ? (
                <div className="mt-2">
                    <PendingNote />
                </div>
            ) : (
                <>
                    <div className="mt-2 overflow-x-auto rounded-card border border-border bg-bg-elevated">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-border text-text-secondary">
                                <tr>
                                    <th className="px-3 py-2">ID</th>
                                    <th className="px-3 py-2">{t('类型', 'Kind')}</th>
                                    <th className="px-3 py-2">{t('操作', 'Operations')}</th>
                                    <th className="px-3 py-2">{t('校验', 'Validation')}</th>
                                    <th className="px-3 py-2">{t('测试', 'Test')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((c) => (
                                    <tr
                                        key={c.id}
                                        className="border-b border-border/40 last:border-0"
                                    >
                                        <td className="px-3 py-2 font-medium text-text-primary">
                                            {c.id}
                                        </td>
                                        <td className="px-3 py-2">{c.kind || '—'}</td>
                                        <td className="max-w-48 truncate px-3 py-2 text-text-muted">
                                            {c.operations.join(', ') || '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            {c.problems.length > 0 ? (
                                                <span className="rounded-full bg-error/15 px-2 py-0.5 text-error">
                                                    {c.problems.length} {t('个问题', 'problem(s)')}
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-success/15 px-2 py-0.5 text-success">
                                                    {t('合法', 'valid')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {c.operations.length > 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => test(c.id, c.operations[0])}
                                                    className="rounded-md border border-border px-2 py-1 text-text-primary hover:border-brand"
                                                >
                                                    {t('测试', 'Test')} {c.operations[0]}
                                                </button>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-3 text-text-muted">
                                            {t(
                                                '暂无连接器配置 — 契约见 docs/f-ecommerce-migration-e6.md',
                                                'No connectors configured — contract in docs/f-ecommerce-migration-e6.md'
                                            )}
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    <details
                        open
                        className="mt-2 rounded-card border border-border bg-bg-elevated px-4 py-3"
                    >
                        <summary className="cursor-pointer text-sm font-medium text-text-primary">
                            {t('新增 / 编辑连接器', 'Add / Edit Connector')}{' '}
                            <span className="font-normal text-text-muted">
                                —{' '}
                                {t(
                                    '凭据在保险库（平台适配器）中，凭 credential_ref 引用',
                                    'credentials live in the vault (Adapters above), referenced by credential_ref'
                                )}
                            </span>
                        </summary>
                        <div className="mt-3 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <input
                                    value={id}
                                    onChange={(e) => setId(e.target.value)}
                                    placeholder={t(
                                        '连接器 ID，如 aws-catalog-sync',
                                        'Connector id, e.g. aws-catalog-sync'
                                    )}
                                    className="w-64 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setId(SYNC_EXAMPLE.id);
                                        setDoc(JSON.stringify(SYNC_EXAMPLE, null, 2));
                                    }}
                                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand"
                                >
                                    {t('载入同步示例', 'Load sync example')}
                                </button>
                            </div>
                            <textarea
                                value={doc}
                                onChange={(e) => setDoc(e.target.value)}
                                placeholder="{} — full connector JSON document"
                                className="h-64 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={save}
                                    className="rounded-md bg-brand px-3 py-1.5 text-sm text-white"
                                >
                                    {t('保存连接器', 'Save Connector')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => test(id.trim())}
                                    className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-brand"
                                >
                                    {t('测试首个操作', 'Test first operation')}
                                </button>
                            </div>
                            <SectionMsg msg={msg} ok={ok} />
                        </div>
                    </details>
                </>
            )}
        </section>
    );
}

// SECTION: policy overrides (migration E6, f-ecommerce settings.html)

function PolicyOverridesSection() {
    const [key, setKey] = useState('');
    const [doc, setDoc] = useState('');
    const [msg, setMsg] = useState('');
    const [ok, setOk] = useState(true);
    const [pending, setPending] = useState(false);

    const load = (k: string) => {
        if (!k.trim()) return;
        guardedLoad(`config:${k.trim()}`, () => api.loadConfig(k.trim()))
            .then((r) => {
                if (r.pending) {
                    setPending(true);
                    return;
                }
                const body = (r.data ?? {}) as {
                    overrides?: Record<string, unknown>;
                    defaults?: Record<string, unknown>;
                };
                const overrides =
                    body.overrides && Object.keys(body.overrides).length > 0
                        ? body.overrides
                        : null;
                setDoc(JSON.stringify(overrides ?? body.defaults ?? {}, null, 2));
                setPending(false);
            })
            .catch(() => {
                setOk(false);
                setMsg(t('加载失败', 'Load failed'));
            });
    };

    const save = () => {
        const parsed = parseJsonInput(doc, { requireNonEmpty: true });
        if (!parsed.ok) {
            setOk(false);
            setMsg(t('JSON 不合法', 'Invalid JSON'));
            return;
        }
        if (!key.trim()) {
            setOk(false);
            setMsg(t('策略键不能为空。', 'Policy key is required.'));
            return;
        }
        api.saveConfig(key.trim(), parsed.value)
            .then(() => {
                setOk(true);
                setMsg(t('覆盖已保存（立即生效）。', 'Override saved (effective immediately).'));
                console.log('[settings] policy override saved:', key);
            })
            .catch((err) => {
                setOk(false);
                setMsg(
                    isGatewayPending(err)
                        ? t('网关面未上线。', 'Gateway surface not shipped yet.')
                        : formatAdminError(err) ||
                              t(
                                  '保存失败（仅 ops_lead/管理员）。',
                                  'Save failed (ops_lead/admin only).'
                              )
                );
            });
    };

    return (
        <section className="mt-6">
            <h2 className="text-sm font-medium text-text-primary">
                {t('策略覆盖', 'Policy Overrides')}{' '}
                <span className="font-normal text-text-muted">
                    {t('运行时合并到模板默认值之上', 'merged over template defaults at runtime')}
                </span>
            </h2>
            <p className="mt-1 text-xs text-text-muted">
                {t(
                    '策略立即生效：模块在运行时读取覆盖值（合并到模板默认值之上）。',
                    'Policies take effect immediately: modules read overrides merged over template defaults at runtime.'
                )}
            </p>
            {pending ? (
                <div className="mt-2">
                    <PendingNote />
                </div>
            ) : (
                <div className="mt-2 flex flex-col gap-2 rounded-card border border-border bg-bg-elevated px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                        <input
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder={t(
                                '策略键，如 pricing_policies',
                                'Policy key, e.g. pricing_policies'
                            )}
                            className="w-64 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                        />
                        <button
                            type="button"
                            onClick={() => load(key)}
                            className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand"
                        >
                            {t('加载', 'Load')}
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            className="rounded-md bg-brand px-3 py-1.5 text-xs text-white"
                        >
                            {t('保存覆盖', 'Save Override')}
                        </button>
                    </div>
                    <textarea
                        value={doc}
                        onChange={(e) => setDoc(e.target.value)}
                        placeholder="{} — JSON override (top-level sections)"
                        className="h-40 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary"
                    />
                    <SectionMsg msg={msg} ok={ok} />
                </div>
            )}
        </section>
    );
}
