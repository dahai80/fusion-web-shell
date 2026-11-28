import { pushToast } from '@/components/ToastHost';
import {
    type FileRow,
    fetchFiles,
    fetchRecycleFiles,
    fileTypeLabel,
    openModuleIdFor,
    restoreFile,
} from '@/lib/fileCenter';
import { useAuth } from '@/stores/auth';
import { t } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import { EmptyState, ErrorState } from '@fusion/web-ui';
import { FileText, HardDrive, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Artifact file center (issue #196 leg 1): shell-level Files surface over
 * fusion-artifacts-engine through the gateway JSON-RPC proxy. Admin-role
 * gated (the gateway route enforces the same rule server-side because the
 * engine's list_all/list_recycle are tenant-wide today). Open-in-module
 * routing resolves the manifest registry live — no hardcoded module list.
 */

type LoadState = 'loading' | 'ready' | 'error';
type FilesTab = 'active' | 'recycle';

const POLL_MS = 30000;

function fmtTime(unix: number): string {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleString();
}

function TypeChip({ row }: { row: FileRow }) {
    const label = fileTypeLabel(row);
    return (
        <span className="inline-flex items-center rounded-md border border-zinc-200/80 bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700/80 dark:bg-zinc-800 dark:text-zinc-300">
            {label}
        </span>
    );
}

export function FilesPage() {
    const me = useAuth((s) => s.user);
    const manifests = useManifests((s) => s.manifests);
    const openTab = useTabs((s) => s.openTab);
    const isAdmin = Boolean(me && (me.roles.includes('admin') || me.permissions.includes('*')));

    const [tab, setTab] = useState<FilesTab>('active');
    const [state, setState] = useState<LoadState>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [rows, setRows] = useState<FileRow[]>([]);
    const [total, setTotal] = useState(0);
    const reload = useRef(false);

    const load = useCallback(async () => {
        if (reload.current) return;
        reload.current = true;
        try {
            const result = tab === 'active' ? await fetchFiles() : await fetchRecycleFiles();
            setRows(result.rows);
            setTotal(result.total);
            setState('ready');
        } catch (err) {
            console.warn('[file-center] load failed', err);
            setErrorMsg(err instanceof Error ? err.message : 'load failed');
            setState('error');
        } finally {
            reload.current = false;
        }
    }, [tab]);

    useEffect(() => {
        setState('loading');
        void load();
        const timer = setInterval(() => void load(), POLL_MS);
        return () => clearInterval(timer);
    }, [load]);

    const openInModule = (row: FileRow) => {
        const moduleId = openModuleIdFor(row);
        const manifest = manifests.find((m) => m.id === moduleId);
        if (!manifest) {
            pushToast(
                'warning',
                t(`模块 ${moduleId} 未注册，无法打开`, `Module ${moduleId} is not registered`)
            );
            return;
        }
        openTab(manifest, { pageTitle: row.name });
        console.log(`[file-center] artifact ${row.id} opened in ${moduleId}`);
    };

    const doRestore = async (row: FileRow) => {
        const result = await restoreFile(row.id);
        if (result.ok) {
            pushToast('success', t('已从回收站恢复', 'Restored from recycle bin'));
            void load();
        } else {
            pushToast('error', result.detail);
        }
    };

    if (!isAdmin) {
        return (
            <div className="p-6">
                <ErrorState
                    message={t(
                        '403 需要管理员角色 — 文件中心仅对管理员开放（引擎侧列表接口当前为租户级）。',
                        '403 Admin role required — the file center is restricted to admins (engine listing is tenant-wide today).'
                    )}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <HardDrive size={18} aria-hidden className="text-zinc-500" />
                    <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {t('文件中心', 'Files')}
                    </h1>
                    <span className="text-sm text-zinc-500">
                        {t(`${total} 项`, `${total} items`)}
                    </span>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-zinc-200/80 p-1 dark:border-zinc-700/80">
                    {(['active', 'recycle'] as FilesTab[]).map((tb) => (
                        <button
                            key={tb}
                            type="button"
                            onClick={() => setTab(tb)}
                            className={`rounded-lg px-3 py-1 text-sm ${tab === tb ? 'bg-brand/10 font-medium text-brand' : 'text-zinc-600 hover:bg-bg-muted dark:text-zinc-300'}`}
                        >
                            {tb === 'active' ? t('文件', 'Active') : t('回收站', 'Recycle bin')}
                        </button>
                    ))}
                </div>
            </div>

            {state === 'error' ? (
                <ErrorState
                    message={errorMsg}
                    retryLabel={t('重试', 'Retry')}
                    onRetry={() => void load()}
                />
            ) : state === 'loading' ? (
                <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60"
                        />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    title={
                        tab === 'active'
                            ? t('暂无文件', 'No files yet')
                            : t('回收站为空', 'Recycle bin is empty')
                    }
                    description={t(
                        '文件由 artifacts-engine 各模块产生后会出现在这里。',
                        'Artifacts produced by modules in the artifacts engine will appear here.'
                    )}
                />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-zinc-200/80 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/80">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                            <tr>
                                <th className="px-4 py-2.5 font-medium">{t('名称', 'Name')}</th>
                                <th className="px-4 py-2.5 font-medium">{t('类型', 'Type')}</th>
                                <th className="px-4 py-2.5 font-medium">{t('所有者', 'Owner')}</th>
                                <th className="px-4 py-2.5 font-medium">
                                    {t('更新时间', 'Updated')}
                                </th>
                                <th className="px-4 py-2.5 font-medium">{t('操作', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className="border-t border-zinc-100 hover:bg-bg-muted/60 dark:border-zinc-800"
                                >
                                    <td className="max-w-64 truncate px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                                        <FileText
                                            size={14}
                                            aria-hidden
                                            className="mr-1.5 inline text-zinc-400"
                                        />
                                        {row.name}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <TypeChip row={row} />
                                    </td>
                                    <td className="px-4 py-2.5 text-zinc-500">
                                        {row.ownerUserId || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-zinc-500">
                                        {fmtTime(row.updatedAt)}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        {tab === 'active' ? (
                                            <button
                                                type="button"
                                                onClick={() => openInModule(row)}
                                                className="rounded-lg border border-zinc-200/80 px-2 py-1 text-xs text-zinc-700 hover:bg-bg-muted dark:border-zinc-700/80 dark:text-zinc-200"
                                            >
                                                {t('打开', 'Open')}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => void doRestore(row)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 px-2 py-1 text-xs text-zinc-700 hover:bg-bg-muted dark:border-zinc-700/80 dark:text-zinc-200"
                                            >
                                                <RotateCcw size={12} aria-hidden />
                                                {t('恢复', 'Restore')}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Trash2 size={12} aria-hidden />
                {t(
                    '回收站条目由引擎按保留期自动清理；共享状态视图待引擎提供 share 列表接口后加入。',
                    'Recycle entries are purged by the engine retention policy; share-state view lands when the engine exposes a share-list surface.'
                )}
            </p>
        </div>
    );
}
