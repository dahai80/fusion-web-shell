import { fetchShellModels } from '@/api/endpoints';
import { pushToast } from '@/components/ToastHost';
import { navigateShell } from '@/lib/adminRoute';
import { type ShellModel, friendlyModelName, isChatModelInfo } from '@/lib/modelCatalog';
import { type ModelPolicy, pickerFilter } from '@/lib/modelPolicy';
import { useAuth } from '@/stores/auth';
import { useKeys } from '@/stores/keys';
import type { ApiKeyRow, IssuedKey, ScopeRow } from '@/stores/keys';
import { flattenScopes, scopeMatrix } from '@/stores/keys';
import { t, useLang } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { useModelPolicy } from '@/stores/modelPolicy';
import { usePrefs } from '@/stores/prefs';
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
    useLang((l) => l.lang);
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
                        className="fs-btn fs-btn-secondary"
                    >
                        {t('← 返回', '← Back')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="fs-btn fs-btn-secondary"
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

            <ModelPolicySection />

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
                    className="mt-3 fs-btn fs-btn-primary disabled:opacity-40"
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
                                            className="fs-btn fs-btn-secondary text-xs"
                                        >
                                            {t('轮换', 'Rotate')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRevokeTarget(k)}
                                            className="fs-btn fs-btn-danger text-xs"
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
            className="fixed inset-0 z-overlay flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="fs-elev-2 w-full max-w-md rounded-card border border-border bg-bg-elevated p-4">
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
                    <button type="button" onClick={onClose} className="fs-btn fs-btn-primary">
                        {t('我已保存', 'Saved')}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Model settings (issue #114): admin edits the tenant policy (default,
 * per-module overrides for model_capable modules, user allowlist, privacy
 * mode); non-admins get a read-only view plus a personal picker constrained
 * by the allowlist and privacy mode. The gateway policy API
 * (fusion-gateway#486) is pending — until it ships the section degrades to
 * a notice and the personal picker stays unconstrained.
 */
function ModelPolicySection() {
    useLang((l) => l.lang);
    const user = useAuth((s) => s.user);
    const isAdmin = !!user && (user.roles.includes('admin') || user.permissions.includes('*'));
    const policy = useModelPolicy((s) => s.policy);
    const loaded = useModelPolicy((s) => s.loaded);
    const pending = useModelPolicy((s) => s.gatewayPending);
    const loadError = useModelPolicy((s) => s.error);
    const load = useModelPolicy((s) => s.load);
    const save = useModelPolicy((s) => s.save);
    const manifests = useManifests((s) => s.manifests);
    const personalModel = usePrefs((s) => s.model);
    const setPersonalModel = usePrefs((s) => s.setModel);
    const [models, setModels] = useState<ShellModel[]>([]);
    const [draft, setDraft] = useState<ModelPolicy | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => {
        void fetchShellModels()
            .then((list) => {
                setModels(list.filter(isChatModelInfo));
            })
            .catch((err) => console.warn('[settings] model catalog failed', err));
    }, []);
    // Editing buffer mirrors the server policy once it arrives.
    useEffect(() => {
        if (loaded && draft === null) {
            setDraft({
                ...policy,
                module_overrides: { ...policy.module_overrides },
                user_allowlist: [...policy.user_allowlist],
            });
        }
    }, [loaded, policy, draft]);

    const chatModels = useMemo(() => models, [models]);
    const capableModules = useMemo(
        () => manifests.filter((m) => m.model_capable === true),
        [manifests]
    );
    // Personal picker: allowlist + privacy constrained (empty allowlist = all).
    const personalOptions = useMemo(
        () => pickerFilter(chatModels, loaded && !pending ? policy : FALLBACK),
        [chatModels, policy, loaded, pending]
    );

    const onSave = async () => {
        if (!draft || busy) return;
        setBusy(true);
        try {
            await save(draft);
            pushToast(
                'success',
                t('模型策略已保存并即时生效', 'Model policy saved and hot-applied')
            );
            console.log('[settings] model policy saved');
        } catch (err) {
            pushToast('error', (err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const selectCls = 'rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text-primary';

    return (
        <div className="mb-6 rounded-card border border-border bg-bg-elevated p-4">
            <div className="text-sm text-text-primary">{t('模型设置', 'Model settings')}</div>
            <div className="mt-1 text-xs text-text-muted">
                {t(
                    '生效链：模块覆盖 > 个人偏好（允许列表内） > 租户默认 > 网关默认',
                    'Chain: module override > personal preference (allowlist) > tenant default > gateway default'
                )}
            </div>

            {pending ? (
                <div className="mt-3 text-sm text-text-secondary">
                    {t(
                        '网关尚未提供模型策略 API（fusion-gateway#486 待上线）。届时本区块自动可用。',
                        'The gateway model-policy API is not shipped yet (fusion-gateway#486). This section becomes usable once it lands.'
                    )}
                </div>
            ) : null}
            {loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : null}

            {!pending && !loadError ? (
                <>
                    {!isAdmin ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <span className="text-sm text-text-secondary">
                                {t('个人偏好模型', 'Personal model')}
                            </span>
                            <select
                                value={personalModel}
                                onChange={(e) => {
                                    setPersonalModel(e.target.value);
                                    console.log('[settings] personal model set:', e.target.value);
                                }}
                                className={selectCls}
                            >
                                <option value="">{t('默认模型', 'Default model')}</option>
                                {personalModel &&
                                !personalOptions.some((m) => m.id === personalModel) ? (
                                    <option value={personalModel}>{personalModel}</option>
                                ) : null}
                                {personalOptions.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {friendlyModelName(m.id)}
                                    </option>
                                ))}
                            </select>
                            {loaded ? (
                                <span className="text-xs text-text-muted">
                                    {t('租户默认', 'Tenant default')}:{' '}
                                    {policy.default_model || t('未设置', 'unset')}
                                    {' · '}
                                    {t('隐私模式', 'Privacy')}:{' '}
                                    {policy.privacy_mode === 'local_only'
                                        ? t('仅本地模型', 'local-only')
                                        : t('全部模型', 'all')}
                                </span>
                            ) : null}
                        </div>
                    ) : null}

                    {isAdmin && draft ? (
                        <>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <span className="text-sm text-text-secondary">
                                    {t('租户默认模型', 'Tenant default model')}
                                </span>
                                <select
                                    value={draft.default_model}
                                    onChange={(e) =>
                                        setDraft({ ...draft, default_model: e.target.value })
                                    }
                                    className={selectCls}
                                >
                                    <option value="">{t('未设置', 'None')}</option>
                                    {chatModels.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {friendlyModelName(m.id)}
                                        </option>
                                    ))}
                                </select>
                                <label className="flex items-center gap-1.5 text-sm text-text-secondary">
                                    <input
                                        type="checkbox"
                                        checked={draft.privacy_mode === 'local_only'}
                                        onChange={(e) =>
                                            setDraft({
                                                ...draft,
                                                privacy_mode: e.target.checked
                                                    ? 'local_only'
                                                    : 'all',
                                            })
                                        }
                                    />
                                    {t('隐私模式：仅本地模型', 'Privacy mode: local-only')}
                                </label>
                            </div>

                            <div className="mt-3">
                                <div className="text-sm text-text-secondary">
                                    {t('用户可选列表', 'User allowlist')}
                                    <span className="ml-2 text-xs text-text-muted">
                                        {t('不勾选 = 不限制', 'none checked = unrestricted')}
                                    </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                    {chatModels.map((m) => (
                                        <label
                                            key={m.id}
                                            className="flex items-center gap-1.5 text-xs text-text-secondary"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={draft.user_allowlist.includes(m.id)}
                                                onChange={(e) =>
                                                    setDraft({
                                                        ...draft,
                                                        user_allowlist: e.target.checked
                                                            ? [...draft.user_allowlist, m.id]
                                                            : draft.user_allowlist.filter(
                                                                  (x) => x !== m.id
                                                              ),
                                                    })
                                                }
                                            />
                                            {friendlyModelName(m.id)}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {capableModules.length > 0 ? (
                                <div className="mt-3">
                                    <div className="text-sm text-text-secondary">
                                        {t('模块覆盖', 'Module overrides')}
                                    </div>
                                    {capableModules.map((mod) => (
                                        <div
                                            key={mod.id}
                                            className="mt-1 flex flex-wrap items-center gap-2"
                                        >
                                            <span className="min-w-48 text-sm text-text-primary">
                                                {mod.title}
                                                <span className="ml-2 font-mono text-xs text-text-muted">
                                                    {mod.id}
                                                </span>
                                            </span>
                                            <select
                                                value={draft.module_overrides[mod.id] ?? ''}
                                                onChange={(e) => {
                                                    const next = { ...draft.module_overrides };
                                                    if (e.target.value)
                                                        next[mod.id] = e.target.value;
                                                    else delete next[mod.id];
                                                    setDraft({ ...draft, module_overrides: next });
                                                }}
                                                className={selectCls}
                                            >
                                                <option value="">{t('继承', 'Inherit')}</option>
                                                {chatModels.map((m) => (
                                                    <option key={m.id} value={m.id}>
                                                        {friendlyModelName(m.id)}
                                                    </option>
                                                ))}
                                            </select>
                                            {mod.suggested_model ? (
                                                <span className="text-xs text-text-muted">
                                                    {t('模块建议', 'suggested')}:{' '}
                                                    {mod.suggested_model}
                                                </span>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onSave()}
                                className="mt-4 fs-btn fs-btn-primary disabled:opacity-40"
                            >
                                {busy ? t('保存中…', 'Saving…') : t('保存并生效', 'Save & apply')}
                            </button>
                        </>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

/** Neutral policy used for picker filtering while the API is pending. */
const FALLBACK: ModelPolicy = {
    default_model: '',
    module_overrides: {},
    user_allowlist: [],
    privacy_mode: 'all',
};
