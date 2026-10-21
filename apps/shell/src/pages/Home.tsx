import { useAuth } from '@/stores/auth';
import { t, useLang } from '@/stores/lang';
import { moduleTitle, useManifests } from '@/stores/manifests';
import type { ModuleManifest } from '@/types/manifest';
import { EmptyState } from '@fusion/web-ui';
import { useState } from 'react';

interface Props {
    onOpen(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
}

/** Engine / resident-node ids shown in the Home status strip. */
const ENGINE_ID = 'fusion-mlx';
const NODE_ID = 'fusion-multi-node';

/** Role-flavored suggested chips (issue #32): prefill + jump to the owning module. */
const STATIC_CHIPS: ReadonlyArray<{
    key: string;
    label: string;
    labelEn: string;
    moduleId: string;
    route: string;
    prefill: string;
}> = [
    {
        key: 'tidy',
        label: '整理桌面',
        labelEn: 'Tidy desktop',
        moduleId: 'fusion-cowork',
        route: '/workflows?new=1',
        prefill: '整理桌面',
    },
    {
        key: 'weekly',
        label: '周报 readout',
        labelEn: 'Weekly readout',
        moduleId: 'fusion-cowork',
        route: '/workflows?new=1',
        prefill: '生成周报 readout',
    },
    {
        key: 'review',
        label: '代码评审',
        labelEn: 'Code review',
        moduleId: 'fusion-agent-studio',
        route: '/canvas?run=1',
        prefill: '代码评审',
    },
    {
        key: 'audit',
        label: '对账',
        labelEn: 'Reconcile',
        moduleId: 'fusion-cowork',
        route: '/workflows?new=1',
        prefill: '月度对账',
    },
    {
        key: 'research',
        label: '研究',
        labelEn: 'Research',
        moduleId: 'fusion-agent-studio',
        route: '/canvas?run=1',
        prefill: '研究一下',
    },
];

// SECTION: greeting

function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
}

function greetingText(hour: number, name: string | undefined, lang: 'zh' | 'en'): string {
    const key = greetingKey(hour);
    const zh = { morning: '早上好', afternoon: '下午好', evening: '晚上好' }[key];
    const en = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' }[
        key
    ];
    const hello = lang === 'en' ? en : zh;
    return name ? `${hello}, ${name}` : hello;
}

// SECTION: status strip

function StatusDot({ online, label }: { online: boolean; label: string }) {
    return (
        <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span
                className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-offline'}`}
                aria-hidden
            />
            {label}
        </span>
    );
}

function StatusStrip({
    manifests,
    unreachableIds,
}: { manifests: ModuleManifest[]; unreachableIds: Set<string> }) {
    const engine = manifests.find((m) => m.id === ENGINE_ID);
    const node = manifests.find((m) => m.id === NODE_ID);
    return (
        <div className="flex flex-wrap items-center gap-4">
            <StatusDot
                online={!!engine && !unreachableIds.has(engine.id)}
                label={
                    engine
                        ? t('推理引擎在线', 'Engine online')
                        : t('推理引擎未注册', 'Engine not registered')
                }
            />
            <StatusDot
                online={!!node && !unreachableIds.has(node.id)}
                label={
                    node
                        ? t('常驻节点在线', 'Node online')
                        : t('常驻节点未注册', 'Node not registered')
                }
            />
            {/* Global model/effort selector placeholder — wired in the delegation issue (#34). */}
            <button
                type="button"
                disabled
                title={t('全局模型选择器即将上线', 'Global model selector coming soon')}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted"
            >
                {t('模型', 'Model')} ▾
            </button>
        </div>
    );
}

// SECTION: task sections

function TaskSection({
    icon,
    title,
    emptyTitle,
    emptyDesc,
}: { icon: string; title: string; emptyTitle: string; emptyDesc: string }) {
    return (
        <section className="rounded-card border border-border bg-bg-elevated">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium text-text-primary">
                <span aria-hidden>{icon}</span>
                {title}
            </h2>
            {/* Task items arrive with the aggregation API (issue #33); empty state meanwhile. */}
            <EmptyState title={emptyTitle} description={emptyDesc} />
        </section>
    );
}

// SECTION: page

/** Home landing (issue #32): greeting + status strip + delegation message box +
 *  task sections + suggested chips. Tasks render empty until #33 ships the
 *  aggregation API; the message box hands off to the delegation routing (#34). */
export function HomePage({ onOpen }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const unreachableIds = useManifests((s) => s.unreachableIds);
    const user = useAuth((s) => s.user);
    const lang = useLang((l) => l.lang);
    const [draft, setDraft] = useState('');
    const byId = new Map(manifests.map((m) => [m.id, m]));

    const manifestChips = manifests.flatMap((m) =>
        (m.home ?? []).filter((c) => c.chip).map((c) => ({ manifest: m, card: c }))
    );

    const jumpChip = (moduleId: string, route: string, prefill: string) => {
        const m = byId.get(moduleId);
        setDraft(prefill);
        if (m) onOpen(m, route);
        else console.warn('[home] chip target module not registered:', moduleId);
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
                <header className="flex flex-col gap-2">
                    <h1 className="text-xl font-medium text-text-primary">
                        {greetingText(new Date().getHours(), user?.display_name, lang)}
                    </h1>
                    <StatusStrip manifests={manifests} unreachableIds={unreachableIds} />
                </header>

                <div className="flex items-end gap-2">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={2}
                        placeholder={t(
                            '问点什么，或直接把活交出来…',
                            'Ask something, or hand over a task…'
                        )}
                        aria-label={t('委托输入框', 'Delegation message box')}
                        className="min-h-[56px] flex-1 resize-none rounded-card border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => setDraft('')}
                        title={t('智能路由即将上线（#34）', 'Smart routing coming soon (#34)')}
                        className="h-10 shrink-0 rounded-card bg-brand px-4 text-sm text-white"
                    >
                        {t('发送', 'Send')}
                    </button>
                </div>

                <div className="flex flex-wrap gap-2" aria-label={t('建议任务', 'Suggested tasks')}>
                    {STATIC_CHIPS.map((c) => {
                        const m = byId.get(c.moduleId);
                        const unreachable = !!m && unreachableIds.has(m.id);
                        return (
                            <button
                                key={c.key}
                                type="button"
                                onClick={() => jumpChip(c.moduleId, c.route, c.prefill)}
                                className={`rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand ${unreachable ? 'opacity-40' : ''}`}
                            >
                                {lang === 'en' ? c.labelEn : c.label}
                            </button>
                        );
                    })}
                    {manifestChips.map(({ manifest, card }) => {
                        const unreachable = unreachableIds.has(manifest.id);
                        const title = lang === 'en' && card.title_en ? card.title_en : card.title;
                        return (
                            <button
                                key={`${manifest.id}:${card.id}`}
                                type="button"
                                onClick={() => jumpChip(manifest.id, card.route, card.title)}
                                title={moduleTitle(manifest, lang)}
                                className={`rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand ${unreachable ? 'opacity-40' : ''}`}
                            >
                                {title}
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-4">
                    <TaskSection
                        icon="▷"
                        title={t('进行中', 'Running')}
                        emptyTitle={t('暂无进行中的任务', 'No running tasks')}
                        emptyDesc={t(
                            '模块任务将跨模块聚合在此展示',
                            'Module tasks will aggregate here across modules'
                        )}
                    />
                    <TaskSection
                        icon="✓"
                        title={t('最近完成', 'Recently completed')}
                        emptyTitle={t(
                            '最近完成的任务会出现在这里',
                            'Completed tasks will appear here'
                        )}
                        emptyDesc={t(
                            '完成后可查看产物与引用',
                            'Inspect artifacts and references once done'
                        )}
                    />
                    <TaskSection
                        icon="⏰"
                        title={t('定时', 'Scheduled')}
                        emptyTitle={t('暂无定时任务', 'No scheduled tasks')}
                        emptyDesc={t(
                            '定时节奏的任务将在此展示',
                            'Scheduled rhythms will surface here'
                        )}
                    />
                </div>
            </div>
        </div>
    );
}
