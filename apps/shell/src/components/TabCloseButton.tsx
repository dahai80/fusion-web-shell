import { useTabs } from '@/stores/tabs';
import { ConfirmDialog } from '@fusion/web-ui';
import { useState } from 'react';

interface Props {
    tabId: string;
    tabTitle: string;
    hasActiveTask: boolean;
    className?: string;
}

/**
 * Tab close with active-task guard (PRD §6.2): closing a tab running a
 * streaming task asks for confirmation first; plain tabs close directly.
 */
export function TabCloseButton({ tabId, tabTitle, hasActiveTask, className }: Props) {
    const [confirming, setConfirming] = useState(false);
    const close = () => {
        if (hasActiveTask) {
            setConfirming(true);
            return;
        }
        useTabs.getState().closeTab(tabId);
    };
    return (
        <>
            <button
                type="button"
                aria-label={`close ${tabTitle}`}
                onClick={(e) => {
                    e.stopPropagation();
                    close();
                }}
                className={
                    className ??
                    'shrink-0 rounded px-1 text-text-muted hover:bg-bg-muted hover:text-text-primary'
                }
            >
                ✕
            </button>
            <ConfirmDialog
                open={confirming}
                danger
                title={`关闭「${tabTitle}」`}
                description="该标签页仍有正在运行的任务，关闭将中断任务。"
                confirmLabel="关闭并中断"
                onConfirm={() => {
                    setConfirming(false);
                    useTabs.getState().forceCloseTab(tabId);
                }}
                onCancel={() => setConfirming(false)}
            />
        </>
    );
}
