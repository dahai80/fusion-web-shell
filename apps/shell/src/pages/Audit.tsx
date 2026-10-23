import { fetchAudit } from '@/api/endpoints';
import { navigateShell } from '@/lib/adminRoute';
import { guardedLoad } from '@/lib/pendingSurfaces';
import {
    AUDIT_CLASSES,
    type AuditEntry,
    sanitizeAudit,
    stripAuditPathPrefix,
} from '@/lib/settingsOps';
import { useAuth } from '@/stores/auth';
import { t } from '@/stores/lang';
import { ErrorState } from '@fusion/web-ui';
import { useCallback, useEffect, useState } from 'react';

/**
 * Audit page (migration E6, f-ecommerce audit.html): read-only, hash-chained
 * audit trail — who did what, with what result. Backed by the gateway audit
 * surface (/api/v1/shell/audit); degrades to a gateway-pending notice until
 * it ships. Auditor/admin only.
 */
export function AuditPage() {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [user, setUser] = useState('');
    const [cls, setCls] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const me = useAuth((s) => s.user);

    const load = useCallback(async (u: string, c: string) => {
        // Issue #46: one 404 marks the audit surface pending for the session;
        // later Apply clicks short-circuit without hitting the network.
        const r = await guardedLoad('audit', () => fetchAudit(u, c)).catch((err) => {
            setError((err as Error).message);
            return null;
        });
        if (!r) return;
        if (r.pending) {
            setPending(true);
            setError(null);
            return;
        }
        setEntries(sanitizeAudit(r.data));
        setPending(false);
        setError(null);
    }, []);

    useEffect(() => {
        void load('', '');
    }, [load]);

    if (me && !me.roles.includes('admin') && !me.roles.includes('auditor')) {
        return (
            <div className="p-6 text-sm text-error">
                {t('需要审计或管理员角色', 'Requires the auditor or admin role')}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl p-4">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <div className="text-lg text-text-primary">{t('审计追踪', 'Audit Trail')}</div>
                    <div className="text-xs text-text-muted">
                        {t(
                            '只读、哈希链式（谁在何时做了什么，结果如何）。任何“被篡改”行意味着日志在系统外被修改。',
                            'Append-only, hash-chained: who did what, with what result. Any tampered row means the log was modified outside the system.'
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => navigateShell('/')}
                    className="fs-btn fs-btn-secondary"
                >
                    {t('← 返回', '← Back')}
                </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <input
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder={t('用户', 'user')}
                    aria-label={t('用户过滤', 'User filter')}
                    className="w-32 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text-primary"
                />
                <select
                    value={cls}
                    onChange={(e) => setCls(e.target.value)}
                    aria-label={t('类别过滤', 'Class filter')}
                    className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text-primary"
                >
                    <option value="">({t('全部', 'all')})</option>
                    {AUDIT_CLASSES.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={() => void load(user, cls)}
                    className="fs-btn fs-btn-secondary"
                >
                    {t('查询', 'Apply')}
                </button>
            </div>

            {pending ? (
                <div className="rounded-card border border-border bg-bg-muted px-4 py-3 text-xs text-text-secondary">
                    {t(
                        '网关尚未提供审计面（契约见 docs/f-ecommerce-migration-e6.md）。服务就绪后本页自动可用。',
                        'The gateway does not expose the audit surface yet (contract in docs/f-ecommerce-migration-e6.md). This page becomes usable once it ships.'
                    )}
                </div>
            ) : error ? (
                <ErrorState message={error} onRetry={() => void load(user, cls)} />
            ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-bg-elevated">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-border text-text-secondary">
                            <tr>
                                <th className="px-3 py-2">{t('时间', 'Time')}</th>
                                <th className="px-3 py-2">{t('用户', 'User')}</th>
                                <th className="px-3 py-2">{t('角色', 'Role')}</th>
                                <th className="px-3 py-2">{t('操作', 'Action')}</th>
                                <th className="px-3 py-2">{t('路径', 'Path')}</th>
                                <th className="px-3 py-2">{t('结果', 'Result')}</th>
                                <th className="px-3 py-2">{t('耗时', 'Duration')}</th>
                                <th className="px-3 py-2">{t('完整性', 'Integrity')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((r, i) => (
                                <tr
                                    key={`${r.ts}:${i}`}
                                    className="border-b border-border/40 last:border-0"
                                >
                                    <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                                        {r.ts > 0 ? new Date(r.ts * 1000).toLocaleString() : '—'}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-text-primary">
                                        {r.user || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-text-muted">{r.role || '—'}</td>
                                    <td className="px-3 py-2">
                                        <span
                                            className={`rounded-full px-2 py-0.5 ${r.action_class === 'read' ? 'bg-bg-muted text-text-muted' : 'bg-brand/15 text-brand'}`}
                                        >
                                            {r.action_class || '—'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-text-muted">
                                        {r.method} {stripAuditPathPrefix(r.path)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span
                                            className={`rounded-full px-2 py-0.5 ${
                                                r.outcome === 'ok'
                                                    ? 'bg-success/15 text-success'
                                                    : r.outcome === 'denied'
                                                      ? 'bg-warning/15 text-warning'
                                                      : 'bg-error/15 text-error'
                                            }`}
                                        >
                                            {r.outcome}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-text-muted">{r.duration_ms}ms</td>
                                    <td className="px-3 py-2">
                                        {r.integrity_ok ? (
                                            <span className="rounded-full bg-success/15 px-2 py-0.5 text-success">
                                                ok
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-error/15 px-2 py-0.5 text-error">
                                                tampered
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {entries.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-3 py-3 text-text-muted">
                                        {t('暂无记录。', 'No entries.')}
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
