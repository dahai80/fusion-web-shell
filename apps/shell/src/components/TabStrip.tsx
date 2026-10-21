import { t, useLang } from '@/stores/lang';
import { useTabs } from '@/stores/tabs';
import { TriangleAlert } from 'lucide-react';
import { TabCloseButton } from './TabCloseButton';

/**
 * Desktop tab strip (PRD §8.1): per-tab title + status badges (crashed /
 * interrupted / transient error) + close guard. Mobile uses the drawer list.
 */
export function TabStrip() {
    const tabs = useTabs((s) => s.tabs);
    const activeTabId = useTabs((s) => s.activeTabId);
    const activateTab = useTabs((s) => s.activateTab);
    const lang = useLang((s) => s.lang);
    if (tabs.length === 0) return null;
    return (
        <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-bg-elevated">
            {tabs.map((tab) => {
                const active = tab.id === activeTabId;
                return (
                    <div
                        key={tab.id}
                        className={`flex min-w-[120px] max-w-[200px] items-center gap-1 border-r border-border px-2 text-xs ${active ? 'bg-bg text-text-primary' : 'text-text-secondary hover:bg-bg-muted'}`}
                    >
                        <button
                            type="button"
                            onClick={() => activateTab(tab.id)}
                            className="flex min-w-0 flex-1 items-center gap-1 py-1.5 text-left"
                        >
                            <span className="truncate">{tab.title}</span>
                            {tab.status === 'crashed' ? (
                                <span
                                    className="shrink-0 text-error"
                                    title={t('已崩溃', 'Crashed')}
                                >
                                    ●
                                </span>
                            ) : null}
                            {tab.interrupted ? (
                                <span
                                    className="shrink-0 text-warning"
                                    title={t('任务已中断，可重试', 'Task interrupted, retryable')}
                                >
                                    ↻
                                </span>
                            ) : null}
                            {tab.transientError ? (
                                <span
                                    className="shrink-0 text-warning"
                                    role="img"
                                    aria-label={t('模块 API 异常', 'Module API error')}
                                    title={`${t('模块 API 异常', 'Module API error')}: ${tab.transientError}`}
                                >
                                    <TriangleAlert size={12} aria-hidden="true" />
                                </span>
                            ) : null}
                            {tab.hasActiveTask ? (
                                <span
                                    className="shrink-0 text-brand"
                                    title={lang === 'en' ? 'Task running' : '任务运行中'}
                                >
                                    ◌
                                </span>
                            ) : null}
                        </button>
                        <TabCloseButton
                            tabId={tab.id}
                            tabTitle={tab.title}
                            hasActiveTask={tab.hasActiveTask}
                        />
                    </div>
                );
            })}
        </div>
    );
}
