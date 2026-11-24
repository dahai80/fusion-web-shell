import { navigateShell } from '@/lib/adminRoute';
import {
    CONVERSATION_STATUSES,
    type Conversation,
    type ThreadMessage,
    fetchConversations,
    fetchMessages,
    postMessage,
    setConversationStatus,
} from '@/lib/messaging';
import { guardedLoad } from '@/lib/pendingSurfaces';
import { useAuth } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import { ErrorState } from '@fusion/web-ui';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

/**
 * Operator messaging console (issue #186): customer↔operator ticket threads
 * scoped to factory orders. Talks to the /api/messaging service (server
 * owner pending — issue contract); degrades to a pending notice like the
 * audit page until the surface ships. Never renders SLA alarms to customers
 * (acceptance item: operator notifications only, #183).
 */

const STATUS_CLS: Record<string, string> = {
    open: 'bg-bg-muted text-text-muted',
    triaged: 'bg-brand/15 text-brand',
    'in-progress': 'bg-brand/15 text-brand',
    fixed: 'bg-success/15 text-success',
    'awaiting-customer': 'bg-warning/15 text-warning',
    closed: 'bg-bg-muted text-text-muted',
};

const STATUS_LABEL: Record<Conversation['status'], [string, string]> = {
    open: ['新开', 'Open'],
    triaged: ['已分诊', 'Triaged'],
    'in-progress': ['处理中', 'In progress'],
    fixed: ['已修复', 'Fixed'],
    'awaiting-customer': ['等客户', 'Awaiting customer'],
    closed: ['已关闭', 'Closed'],
};

export function MessagesPage() {
    useLang((l) => l.lang);
    const me = useAuth((s) => s.user);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selected, setSelected] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ThreadMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const loadConversations = useCallback(async () => {
        // 404/501 = /api/messaging surface not shipped yet (#46 pattern): one
        // muted pending badge for the session instead of a 404 per render.
        const r = await guardedLoad('messaging', () => fetchConversations()).catch((err) => {
            setError((err as Error).message);
            return null;
        });
        if (!r) return;
        if (r.pending) {
            setPending(true);
            setError(null);
            return;
        }
        setConversations(r.data);
        setPending(false);
        setError(null);
    }, []);

    const openThread = useCallback(async (conv: Conversation) => {
        setSelected(conv);
        setMessages([]);
        try {
            setMessages(await fetchMessages(conv.id));
        } catch (err) {
            console.warn('[messages] thread load failed:', err);
            setError((err as Error).message);
        }
    }, []);

    useEffect(() => {
        void loadConversations();
    }, [loadConversations]);

    const send = async () => {
        if (!selected || !draft.trim() || busy) return;
        setBusy(true);
        try {
            await postMessage(selected.id, draft.trim());
            setDraft('');
            setMessages(await fetchMessages(selected.id));
            console.log('[messages] reply sent:', selected.id);
        } catch (err) {
            console.warn('[messages] reply failed:', err);
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const changeStatus = async (status: Conversation['status']) => {
        if (!selected) return;
        const prev = selected;
        setSelected({ ...selected, status });
        try {
            await setConversationStatus(selected.id, status);
        } catch (err) {
            console.warn('[messages] status update failed:', err);
            setSelected(prev);
            setError((err as Error).message);
        }
    };

    if (me && !me.roles.includes('admin') && !me.roles.includes('operator')) {
        return (
            <div className="p-6 text-sm text-error">
                {t('需要运营或管理员角色', 'Requires the operator or admin role')}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl p-4">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-lg text-text-primary">
                        <MessageSquare size={18} aria-hidden />
                        {t('客户消息', 'Customer Messages')}
                    </div>
                    <div className="text-xs text-text-muted">
                        {t(
                            '工单线程：客户在订单页发起，运营在此回复。状态芯片仅运营可见的 SLA 提醒走通知中心（#183）。',
                            'Ticket threads: customers open from the order page, operators reply here. SLA warnings go to the operator notification center only (#183).'
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

            {pending ? (
                <div className="rounded-card border border-border bg-bg-muted px-4 py-3 text-xs text-text-secondary">
                    {t(
                        '消息服务（/api/messaging）尚未上线（契约见 issue #186）。服务就绪后本页自动可用。',
                        'The messaging service (/api/messaging) is not shipped yet (contract in issue #186). This page becomes usable once it lands.'
                    )}
                </div>
            ) : error ? (
                <ErrorState message={error} onRetry={() => void loadConversations()} />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <div className="rounded-card border border-border bg-bg-elevated">
                        {conversations.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-text-muted">
                                {t('暂无会话。', 'No conversations.')}
                            </div>
                        ) : (
                            conversations.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => void openThread(c)}
                                    className={`flex w-full items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-left text-sm last:border-0 hover:bg-bg-muted ${
                                        selected?.id === c.id ? 'bg-bg-muted' : ''
                                    }`}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium text-text-primary">
                                            {c.subject || t('（无主题）', '(no subject)')}
                                        </span>
                                        <span className="block truncate text-xs text-text-muted">
                                            {t('订单', 'order')} {c.ref || '—'}
                                            {c.linkedIssueId ? ` · #${c.linkedIssueId}` : ''}
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1">
                                        {c.unread > 0 ? (
                                            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] text-white">
                                                {c.unread}
                                            </span>
                                        ) : null}
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[c.status] ?? STATUS_CLS.open}`}
                                        >
                                            {t(
                                                STATUS_LABEL[c.status][0],
                                                STATUS_LABEL[c.status][1]
                                            )}
                                        </span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>

                    <div className="flex min-h-64 flex-col rounded-card border border-border bg-bg-elevated">
                        {!selected ? (
                            <div className="flex flex-1 items-center justify-center px-4 text-xs text-text-muted">
                                {t(
                                    '选择左侧会话查看线程。',
                                    'Select a conversation to read the thread.'
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                                    <div className="min-w-0 truncate text-sm font-medium text-text-primary">
                                        {selected.subject}
                                        {selected.ref ? ` · ${selected.ref}` : ''}
                                    </div>
                                    <select
                                        value={selected.status}
                                        onChange={(e) =>
                                            void changeStatus(
                                                e.target.value as Conversation['status']
                                            )
                                        }
                                        aria-label={t('状态芯片', 'Status chip')}
                                        className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-primary"
                                    >
                                        {CONVERSATION_STATUSES.map((s) => (
                                            <option key={s} value={s}>
                                                {t(STATUS_LABEL[s][0], STATUS_LABEL[s][1])}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                                    {messages.length === 0 ? (
                                        <div className="py-6 text-center text-xs text-text-muted">
                                            {t('暂无消息。', 'No messages.')}
                                        </div>
                                    ) : (
                                        messages.map((m) => (
                                            <div key={m.id} className="mb-2">
                                                <div className="text-[10px] text-text-muted">
                                                    {m.sender || m.senderRole}
                                                    {m.ts > 0
                                                        ? ` · ${new Date(m.ts * 1000).toLocaleString()}`
                                                        : ''}
                                                </div>
                                                <div
                                                    className={`mt-0.5 max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                                                        m.senderRole === 'operator'
                                                            ? 'ml-auto bg-brand/15 text-text-primary'
                                                            : 'bg-bg-muted text-text-primary'
                                                    }`}
                                                >
                                                    {m.content}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="flex items-end gap-2 border-t border-border px-3 py-2">
                                    <textarea
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        rows={2}
                                        aria-label={t('回复内容', 'Reply content')}
                                        placeholder={t('输入回复…', 'Type a reply…')}
                                        className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void send()}
                                        disabled={busy || !draft.trim()}
                                        className="fs-btn fs-btn-primary disabled:opacity-50"
                                    >
                                        {busy ? t('发送中…', 'Sending…') : t('发送', 'Send')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
