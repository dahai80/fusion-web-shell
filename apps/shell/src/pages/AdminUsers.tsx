import * as api from '@/api/endpoints';
import { isGatewayPending } from '@/api/endpoints';
import { pushToast } from '@/components/ToastHost';
import {
    type MenuPermissionsDoc,
    type RoleRow,
    collectMenuMatrix,
    effectiveMenus,
    sanitizeRoles,
} from '@/lib/settingsOps';
import { useAuth } from '@/stores/auth';
import { t } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import type { ModuleManifest } from '@/types/manifest';
import { ConfirmDialog } from '@fusion/web-ui';
import { Skeleton } from '@fusion/web-ui';
import { EmptyState } from '@fusion/web-ui';
import { ErrorState } from '@fusion/web-ui';
import { useCallback, useEffect, useState } from 'react';

type LoadState = 'loading' | 'ready' | 'error';
type AdminTab = 'users' | 'roles' | 'menus';

/** Built-in admin page (PRD §4.2, migration E6): Users / Roles / Menu
 *  Permissions tabs — Users tab is the existing user CRUD + grant tree;
 *  Roles and Menu Permissions follow the f-ecommerce users.html GUI backed
 *  by the E5 identity contract, degrading to a gateway-pending notice until
 *  the surfaces ship. */
export function AdminUsersPage() {
    const [tab, setTab] = useState<AdminTab>('users');
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
            <div
                className="mb-3 flex gap-1"
                role="tablist"
                aria-label={t('管理标签', 'Admin tabs')}
            >
                {(
                    [
                        ['users', t('用户', 'Users')],
                        ['roles', t('角色', 'Roles')],
                        ['menus', t('菜单权限', 'Menu Permissions')],
                    ] as Array<[AdminTab, string]>
                ).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        onClick={() => setTab(id)}
                        className={`rounded-md px-3 py-1.5 text-sm ${
                            tab === id
                                ? 'bg-brand text-white'
                                : 'border border-border text-text-secondary hover:border-brand'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {tab === 'users' ? (
                <>
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
                        <EmptyState
                            title="暂无用户"
                            description="创建第一个用户后开始分配模块权限"
                        />
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
                                                        pushToast(
                                                            'info',
                                                            `临时密码: ${r.temp_password}`
                                                        )
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
                                                    .updateUser(u.user_id, {
                                                        disabled: !u.disabled,
                                                    })
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
                </>
            ) : tab === 'roles' ? (
                <RolesPanel />
            ) : (
                <MenuPermissionsPanel />
            )}
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

// SECTION: roles (migration E6, f-ecommerce users.html tab 2; E5 identity contract)

const PENDING_NOTE_ZH =
    '角色 / 菜单矩阵依赖身份服务契约（fusion-identity#12，E5）。服务就绪后本区自动可用。';
const PENDING_NOTE_EN =
    'Roles / menu matrix rely on the identity contract (fusion-identity#12, E5). They become usable once the surfaces ship.';

function PendingBox() {
    return (
        <div className="rounded-card border border-border bg-bg-muted px-4 py-3 text-xs text-text-secondary">
            {t(PENDING_NOTE_ZH, PENDING_NOTE_EN)}
        </div>
    );
}

function RolesPanel() {
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [writeClasses, setWriteClasses] = useState<string[]>([]);
    const [pending, setPending] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [classes, setClasses] = useState<Set<string>>(new Set());
    const [msg, setMsg] = useState('');
    const [ok, setOk] = useState(true);

    const reload = useCallback(async () => {
        try {
            const d = await api.listRoles();
            const parsed = sanitizeRoles(d);
            setRoles(parsed.roles);
            setWriteClasses(parsed.writeClasses);
            setPending(false);
        } catch (err) {
            if (isGatewayPending(err)) setPending(true);
            else console.warn('[admin] roles list failed', err);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const create = () => {
        api.createRole({
            name: name.trim(),
            description: description.trim(),
            write_classes: [...classes],
        })
            .then(() => {
                setOk(true);
                setMsg(
                    t(
                        `角色已创建（授权: ${[...classes].join(', ') || '只读'}）。`,
                        `Role created (grants: ${[...classes].join(', ') || 'read-only'}).`
                    )
                );
                setName('');
                setDescription('');
                setClasses(new Set());
                void reload();
            })
            .catch((err) => {
                setOk(false);
                setMsg(
                    isGatewayPending(err)
                        ? t(PENDING_NOTE_ZH, PENDING_NOTE_EN)
                        : (err as Error).message
                );
            });
    };

    const remove = (role: string) => {
        if (
            !window.confirm(
                t(
                    `删除角色 '${role}'？需先转移其用户。`,
                    `Delete role '${role}'? Reassign its users first.`
                )
            )
        )
            return;
        api.deleteRole(role)
            .then(() => {
                setOk(true);
                setMsg(
                    t(
                        '角色已删除（菜单映射同步移除）。',
                        'Role deleted (also removed from menu mappings).'
                    )
                );
                void reload();
            })
            .catch((err) => {
                setOk(false);
                setMsg(
                    isGatewayPending(err)
                        ? t(PENDING_NOTE_ZH, PENDING_NOTE_EN)
                        : (err as Error).message
                );
            });
    };

    return (
        <section>
            <h2 className="text-sm font-medium text-text-primary">
                {t('角色', 'Roles')}{' '}
                <span className="font-normal text-text-muted">
                    {t(
                        '内置角色固定；自定义角色授予写权限类',
                        'builtins are fixed; custom roles grant write classes'
                    )}
                </span>
            </h2>
            {pending ? (
                <div className="mt-2">
                    <PendingBox />
                </div>
            ) : (
                <>
                    <div className="mt-2 overflow-hidden rounded-card border border-border bg-bg-elevated">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-border text-text-secondary">
                                <tr>
                                    <th className="px-3 py-2">{t('角色', 'Role')}</th>
                                    <th className="px-3 py-2">{t('类型', 'Type')}</th>
                                    <th className="px-3 py-2">
                                        {t('写权限', 'Write Permissions')}
                                    </th>
                                    <th className="px-3 py-2">{t('用户数', 'Users')}</th>
                                    <th className="px-3 py-2">{t('操作', 'Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map((r) => (
                                    <tr
                                        key={r.name}
                                        className="border-b border-border/40 last:border-0"
                                    >
                                        <td className="px-3 py-2 font-medium text-text-primary">
                                            {r.name}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span
                                                className={`rounded-full px-2 py-0.5 ${r.builtin ? 'bg-bg-muted text-text-muted' : 'bg-brand/15 text-brand'}`}
                                            >
                                                {r.builtin
                                                    ? t('内置', 'builtin')
                                                    : t('自定义', 'custom')}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-text-muted">
                                            {r.write_classes.join(', ') || t('只读', 'read-only')}
                                            {r.description ? ` — ${r.description}` : ''}
                                        </td>
                                        <td className="px-3 py-2">{r.user_count}</td>
                                        <td className="px-3 py-2">
                                            {r.builtin ? (
                                                '—'
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => remove(r.name)}
                                                    className="rounded-md border border-error/60 px-2 py-1 text-error"
                                                >
                                                    {t('删除', 'Delete')}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {roles.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-3 text-text-muted">
                                            {t('暂无角色数据', 'No roles returned')}
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    <details className="mt-2 rounded-card border border-border bg-bg-elevated px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-text-primary">
                            {t('创建自定义角色', 'Create Custom Role')}{' '}
                            <span className="font-normal text-text-muted">
                                {t('授予一组写权限', 'grants a set of write permissions')}
                            </span>
                        </summary>
                        <div className="mt-3 flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t('角色名（小写）', 'role name (lowercase)')}
                                    className="w-44 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                                />
                                <input
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={t('描述（可选）', 'Description (optional)')}
                                    className="w-60 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                                <span className="text-text-muted">{t('授权:', 'Grants:')}</span>
                                {writeClasses.map((c) => (
                                    <label key={c} className="flex items-center gap-1">
                                        <input
                                            type="checkbox"
                                            checked={classes.has(c)}
                                            onChange={() => {
                                                const next = new Set(classes);
                                                if (next.has(c)) next.delete(c);
                                                else next.add(c);
                                                setClasses(next);
                                            }}
                                        />
                                        {c}
                                    </label>
                                ))}
                                <button
                                    type="button"
                                    onClick={create}
                                    className="rounded-md bg-brand px-3 py-1.5 text-white"
                                >
                                    {t('创建角色', 'Create Role')}
                                </button>
                            </div>
                            {msg ? (
                                <p
                                    className={`text-xs ${ok ? 'text-success' : 'text-error'}`}
                                    role="status"
                                >
                                    {msg}
                                </p>
                            ) : null}
                        </div>
                    </details>
                </>
            )}
        </section>
    );
}

// SECTION: menu permissions (migration E6, f-ecommerce users.html tab 3)

const cell = (role: string, i: number) => `${role}:${i}`;

function MenuPermissionsPanel() {
    const [menus, setMenus] = useState<MenuPermissionsDoc['menus']>([]);
    const [allRoles, setAllRoles] = useState<string[]>([]);
    const [grid, setGrid] = useState<Set<string>>(new Set());
    const [pending, setPending] = useState(false);
    const [msg, setMsg] = useState('');
    const [ok, setOk] = useState(true);
    const [newId, setNewId] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newHref, setNewHref] = useState('');

    const reload = useCallback(async () => {
        try {
            const [permDoc, rolesDoc] = await Promise.all([
                api.loadMenuPermissions(),
                api.listRoles(),
            ]);
            const doc = effectiveMenus(permDoc);
            const parsed = sanitizeRoles(rolesDoc);
            setMenus(doc.menus);
            setAllRoles(parsed.roles.map((r) => r.name));
            const next = new Set<string>();
            doc.menus.forEach((m, i) => m.roles.forEach((r) => next.add(cell(r, i))));
            setGrid(next);
            setPending(false);
        } catch (err) {
            if (isGatewayPending(err)) setPending(true);
            else console.warn('[admin] menu permissions load failed', err);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const saveGrid = (doc: MenuPermissionsDoc, note: string) => {
        api.saveMenuPermissions(doc)
            .then(() => {
                setOk(true);
                setMsg(note);
                console.log('[admin] menu permissions saved:', doc.menus.length, 'menus');
            })
            .catch((err) => {
                setOk(false);
                setMsg(
                    isGatewayPending(err)
                        ? t(PENDING_NOTE_ZH, PENDING_NOTE_EN)
                        : (err as Error).message
                );
            });
    };

    const save = () => {
        const doc = collectMenuMatrix(menus, allRoles, (role, i) => grid.has(cell(role, i)));
        saveGrid(
            doc,
            t(
                '已保存 — 用户下次加载页面时生效。',
                'Saved — visible to users on their next page load.'
            )
        );
    };

    const reset = async () => {
        try {
            const permDoc = await api.loadMenuPermissions();
            const defaults = (permDoc as { defaults?: MenuPermissionsDoc }).defaults;
            if (!defaults) {
                setOk(false);
                setMsg(t('无默认菜单矩阵可重置。', 'No defaults to reset to.'));
                return;
            }
            saveGrid(defaults, t('已重置为默认。', 'Reset to defaults.'));
            void reload();
        } catch (err) {
            setOk(false);
            setMsg((err as Error).message);
        }
    };

    const addMenu = () => {
        const id = newId.trim();
        const href = newHref.trim();
        if (!id || !href) {
            setOk(false);
            setMsg(t('菜单 ID 与 href 必填。', 'Menu id and href are required.'));
            return;
        }
        if (menus.some((m) => m.id === id)) {
            setOk(false);
            setMsg(t(`菜单 '${id}' 已存在。`, `Menu '${id}' already exists.`));
            return;
        }
        const next = [...menus, { id, label: newLabel.trim() || id, href, roles: ['admin'] }];
        const nextGrid = new Set(grid);
        nextGrid.add(cell('admin', next.length - 1));
        setMenus(next);
        setGrid(nextGrid);
        saveGrid(
            collectMenuMatrix(next, allRoles, (role, i) => nextGrid.has(cell(role, i))),
            t('菜单已添加。', 'Menu added.')
        );
        setNewId('');
        setNewLabel('');
        setNewHref('');
    };

    const deleteMenu = (id: string) => {
        if (
            !window.confirm(
                t(`从所有角色移除菜单 '${id}'？`, `Remove menu '${id}' from all roles?`)
            )
        )
            return;
        const next = menus.filter((m) => m.id !== id);
        setMenus(next);
        saveGrid(
            collectMenuMatrix(next, allRoles, (role, i) => grid.has(cell(role, i))),
            t('菜单已移除。', 'Menu removed.')
        );
    };

    return (
        <section>
            <h2 className="text-sm font-medium text-text-primary">
                {t('菜单权限', 'Menu Permissions')}{' '}
                <span className="font-normal text-text-muted">
                    {t(
                        '角色 ↔ 菜单映射 — 下次页面加载时生效',
                        'role ↔ menu mapping — takes effect on next page load'
                    )}
                </span>
            </h2>
            {pending ? (
                <div className="mt-2">
                    <PendingBox />
                </div>
            ) : (
                <>
                    <div className="mt-2 overflow-x-auto rounded-card border border-border bg-bg-elevated">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-border text-text-secondary">
                                <tr>
                                    <th className="px-3 py-2">{t('菜单', 'Menu')}</th>
                                    {allRoles.map((r) => (
                                        <th key={r} className="px-3 py-2">
                                            {r}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {menus.map((m, i) => (
                                    <tr
                                        key={m.id}
                                        className="border-b border-border/40 last:border-0"
                                    >
                                        <td className="px-3 py-2 font-medium text-text-primary">
                                            {m.label}{' '}
                                            <span className="font-mono text-text-muted">
                                                ({m.id})
                                            </span>
                                        </td>
                                        {allRoles.map((r) => (
                                            <td key={r} className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`${m.label} ${r}`}
                                                    checked={grid.has(cell(r, i))}
                                                    onChange={() => {
                                                        const next = new Set(grid);
                                                        const c = cell(r, i);
                                                        if (next.has(c)) next.delete(c);
                                                        else next.add(c);
                                                        setGrid(next);
                                                    }}
                                                />
                                            </td>
                                        ))}
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => deleteMenu(m.id)}
                                                className="rounded-md border border-error/60 px-2 py-1 text-error"
                                                aria-label={t(
                                                    `移除菜单 ${m.id}`,
                                                    `Remove menu ${m.id}`
                                                )}
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {menus.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={allRoles.length + 2}
                                            className="px-3 py-3 text-text-muted"
                                        >
                                            {t('暂无菜单矩阵数据', 'No menu matrix returned')}
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={save}
                            className="rounded-md bg-brand px-3 py-1.5 text-sm text-white"
                        >
                            {t('保存菜单权限', 'Save Menu Permissions')}
                        </button>
                        <button
                            type="button"
                            onClick={() => void reset()}
                            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-brand"
                        >
                            {t('重置为默认', 'Reset to Defaults')}
                        </button>
                    </div>
                    {msg ? (
                        <p
                            className={`mt-2 text-xs ${ok ? 'text-success' : 'text-error'}`}
                            role="status"
                        >
                            {msg}
                        </p>
                    ) : null}
                    <details className="mt-2 rounded-card border border-border bg-bg-elevated px-4 py-3">
                        <summary className="cursor-pointer text-sm font-medium text-text-primary">
                            {t('新增菜单', 'Add Menu')}{' '}
                            <span className="font-normal text-text-muted">
                                {t(
                                    '注册自定义菜单项（授予角色可见）',
                                    'register a custom menu item (served to granted roles)'
                                )}
                            </span>
                        </summary>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <input
                                value={newId}
                                onChange={(e) => setNewId(e.target.value)}
                                placeholder={t('菜单 ID，如 reports', 'Menu id, e.g. reports')}
                                className="w-40 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                            />
                            <input
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder={t('名称，如 报表', 'Label, e.g. Reports')}
                                className="w-40 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                            />
                            <input
                                value={newHref}
                                onChange={(e) => setNewHref(e.target.value)}
                                placeholder={t(
                                    'href，如 /admin/reports',
                                    'href, e.g. /admin/reports'
                                )}
                                className="w-48 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                            />
                            <button
                                type="button"
                                onClick={addMenu}
                                className="rounded-md border border-border px-3 py-1.5 text-sm text-text-primary hover:border-brand"
                            >
                                {t('添加', 'Add')}
                            </button>
                            <span className="self-center text-xs text-text-muted">
                                {t('删除用上方行内 ✕。', 'Delete with the ✕ on the row above.')}
                            </span>
                        </div>
                    </details>
                </>
            )}
        </section>
    );
}
