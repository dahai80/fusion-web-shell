import { t } from '@/stores/lang';
import { type NotificationItem, useNotifications } from '@/stores/notifications';
import { Bell } from 'lucide-react';
import { useState } from 'react';

const KIND_LABEL: Record<NotificationItem['kind'], [string, string]> = {
    approvals: ['审批', 'Approvals'],
    runs: ['运行', 'Runs'],
    engine: ['引擎', 'Engine'],
    tasks: ['任务', 'Tasks'],
};

const LEVEL_DOT: Record<NotificationItem['level'], string> = {
    info: 'bg-running',
    warning: 'bg-warning',
    error: 'bg-error',
};

/** Notification bell: unread badge + dropdown list; click item = open + mark read. */
export function NotificationBell() {
    const items = useNotifications((s) => s.items);
    const readIds = useNotifications((s) => s.readIds);
    const openItem = useNotifications((s) => s.openItem);
    const markAllRead = useNotifications((s) => s.markAllRead);
    const [open, setOpen] = useState(false);
    const unread = items.filter((i) => !readIds.has(i.id)).length;

    return (
        <span className="relative inline-flex">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="relative rounded p-1 text-xs text-text-muted hover:bg-bg-muted"
                aria-label={t('通知中心', 'Notification center')}
                title={t('通知中心', 'Notification center')}
            >
                <Bell size={16} aria-hidden="true" />
                {unread > 0 ? (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] leading-none text-white">
                        {unread > 99 ? '99+' : unread}
                    </span>
                ) : null}
            </button>
            {open ? (
                <div className="fs-elev-1 absolute top-full right-0 z-dropdown mt-1 w-72 rounded-card border border-border bg-bg-elevated">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-text-muted">
                        <span>{t('通知', 'Notifications')}</span>
                        <button
                            type="button"
                            onClick={markAllRead}
                            className="text-text-muted hover:text-brand"
                        >
                            {t('全部已读', 'Mark all read')}
                        </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {items.length === 0 ? (
                            <div className="px-3 py-6 text-center text-sm text-text-muted">
                                {t('暂无通知', 'No notifications')}
                            </div>
                        ) : (
                            items.map((item) => (
                                <button
                                    type="button"
                                    key={item.id}
                                    onClick={() => {
                                        openItem(item.id);
                                        setOpen(false);
                                    }}
                                    className={`flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-bg-muted ${readIds.has(item.id) ? 'opacity-50' : ''}`}
                                >
                                    <span
                                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[item.level]}`}
                                        aria-hidden="true"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-text-primary">
                                            {item.title}
                                        </span>
                                        <span className="text-xs text-text-muted">
                                            {t(KIND_LABEL[item.kind][0], KIND_LABEL[item.kind][1])}
                                        </span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            ) : null}
        </span>
    );
}
