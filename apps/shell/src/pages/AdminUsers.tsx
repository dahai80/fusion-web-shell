import * as api from '@/api/endpoints';
import { pushToast } from '@/components/ToastHost';
import { useAuth } from '@/stores/auth';
import { useManifests } from '@/stores/manifests';
import type { ModuleManifest } from '@/types/manifest';
import { ConfirmDialog } from '@fusion/web-ui';
import { Skeleton } from '@fusion/web-ui';
import { EmptyState } from '@fusion/web-ui';
import { ErrorState } from '@fusion/web-ui';
import { useCallback, useEffect, useState } from 'react';

type LoadState = 'loading' | 'ready' | 'error';

/** Built-in admin page (PRD §4.2): user CRUD + per-module grant checkbox tree. */
export function AdminUsersPage() {
    const [state, setState] = useState<LoadState>('loading');
    const [users, setUsers] = useState<api.AdminUserRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [grantUser, setGrantUser] = useState<api.AdminUserRow | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<api.AdminUserRow | null>(null);
    const manifests = useManifests((s) => s.manifests);
    const me = useAuth((s) => s.user);

    const reload = useCallback(async () => {
        setState('loading');
        try {
            const rows = await api.listUsers();
            setUsers(rows);
            setState('ready');
        } catch (err) {
            console.error('[admin] list users failed', err);
            setError((err as Error).message);
            setState('error');
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    if (me && !me.roles.includes('admin')) {
        return <div className="p-6 text-sm text-error">需要管理员角色</div>;
    }

    return (
        <div className="mx-auto max-w-3xl p-4">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <div className="text-lg text-text-primary">用户与授权管理</div>
                    <div className="text-xs text-text-muted">
                        新模块注册后默认无人可见，勾选后才出现在用户菜单
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void reload()}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary"
                >
                    刷新
                </button>
            </div>
            {state === 'loading' ? (
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : null}
            {state === 'error' ? (
                <ErrorState message={error ?? '加载失败'} onRetry={() => void reload()} />
            ) : null}
            {state === 'ready' && users.length === 0 ? (
                <EmptyState title="暂无用户" description="创建第一个用户后开始分配模块权限" />
            ) : null}
            {state === 'ready' && users.length > 0 ? (
                <div className="overflow-hidden rounded-card border border-border bg-bg-elevated">
                    {users.map((u) => (
                        <div
                            key={u.user_id}
                            className="flex items-center justify-between border-b border-border/60 px-4 py-3 last:border-0"
                        >
                            <div className="min-w-0">
                                <div className="text-sm text-text-primary">
                                    {u.display_name}{' '}
                                    <span className="font-mono text-xs text-text-muted">
                                        {u.user_id}
                                    </span>
                                    {u.roles.includes('admin') ? (
                                        <span className="ml-2 rounded-full bg-brand/15 px-2 text-xs text-brand">
                                            admin
                                        </span>
                                    ) : null}
                                    {u.disabled ? (
                                        <span className="ml-2 rounded-full bg-bg-muted px-2 text-xs text-offline">
                                            已禁用
                                        </span>
                                    ) : null}
                                </div>
                                <div className="text-xs text-text-muted">
                                    已授权 {u.permissions.length} 个模块
                                </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setGrantUser(u)}
                                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-primary"
                                >
                                    授权
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        void api
                                            .resetUserPassword(u.user_id)
                                            .then((r) =>
                                                pushToast('info', `临时密码: ${r.temp_password}`)
                                            )
                                            .catch((err) =>
                                                pushToast('error', (err as Error).message)
                                            )
                                    }
                                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-primary"
                                >
                                    重置密码
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        void api
                                            .updateUser(u.user_id, { disabled: !u.disabled })
                                            .then(() => void reload())
                                            .catch((err) =>
                                                pushToast('error', (err as Error).message)
                                            )
                                    }
                                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-primary"
                                >
                                    {u.disabled ? '启用' : '禁用'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmDelete(u)}
                                    className="rounded-md border border-error/60 px-3 py-1.5 text-xs text-error"
                                >
                                    删除
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {grantUser ? (
                <GrantDialog
                    user={grantUser}
                    onClose={() => setGrantUser(null)}
                    onSaved={() => {
                        setGrantUser(null);
                        void reload();
                    }}
                    manifests={manifests}
                />
            ) : null}
            <ConfirmDialog
                open={confirmDelete !== null}
                danger
                title={`删除用户 ${confirmDelete?.display_name ?? ''}`}
                description="删除后该用户无法登录，授权记录一并移除。"
                confirmName={confirmDelete?.user_id}
                confirmLabel="删除"
                onCancel={() => setConfirmDelete(null)}
                onConfirm={() => {
                    if (!confirmDelete) return;
                    void api
                        .deleteUser(confirmDelete.user_id)
                        .then(() => {
                            setConfirmDelete(null);
                            void reload();
                        })
                        .catch((err) => pushToast('error', (err as Error).message));
                }}
            />
        </div>
    );
}

function GrantDialog({
    user,
    onClose,
    onSaved,
    manifests,
}: { user: api.AdminUserRow; onClose(): void; onSaved(): void; manifests: ModuleManifest[] }) {
    const [selected, setSelected] = useState<Set<string>>(new Set(user.permissions));
    const cats: Array<'platform' | 'domain' | 'infra' | 'dev'> = [
        'platform',
        'domain',
        'infra',
        'dev',
    ];
    const catLabel = { platform: '平台', domain: '领域', infra: '基础设施', dev: '开发' };

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-card border border-border bg-bg-elevated p-4">
                <div className="text-base text-text-primary">授权: {user.display_name}</div>
                <div className="mt-3 space-y-3">
                    {cats.map((cat) => {
                        const items = manifests.filter((m) => m.category === cat);
                        if (items.length === 0) return null;
                        return (
                            <div key={cat}>
                                <div className="pb-1 text-xs text-text-muted">{catLabel[cat]}</div>
                                {items.map((m) => (
                                    <label
                                        key={m.id}
                                        className="flex min-h-[36px] items-center gap-2 text-sm text-text-primary"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected.has(m.id)}
                                            onChange={() => toggle(m.id)}
                                        />
                                        {m.title}
                                        <span className="font-mono text-xs text-text-muted">
                                            {m.id}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        );
                    })}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-border px-4 py-2 text-sm text-text-secondary"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void api
                                .updateUser(user.user_id, { permissions: [...selected] })
                                .then(onSaved)
                                .catch((err) => pushToast('error', (err as Error).message));
                        }}
                        className="rounded-md bg-brand px-4 py-2 text-sm text-white"
                    >
                        保存授权
                    </button>
                </div>
            </div>
        </div>
    );
}
