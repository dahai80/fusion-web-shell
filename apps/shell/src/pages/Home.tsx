import { fetchEngineModels } from '@/api/endpoints';
import { pushToast } from '@/components/ToastHost';
import { composerCapabilities } from '@/lib/composerCapabilities';
import { useAuth } from '@/stores/auth';
import {
    type DelegationDecision,
    logDelegation,
    routeDelegation,
    useDelegation,
} from '@/stores/delegation';
import { t, useLang } from '@/stores/lang';
import type { Lang } from '@/stores/lang';
import { moduleTitle, useManifests } from '@/stores/manifests';
import { type Effort, usePrefs } from '@/stores/prefs';
import type { ComposerChip } from '@fusion/web-ui';
import { type ProjectItem, useProjects } from '@/stores/projects';
import { type ApprovalAction, type TaskItem, taskBucket, useTasks } from '@/stores/tasks';
import type { ModuleManifest } from '@/types/manifest';
import { ChatThread, Composer, EmptyState } from '@fusion/web-ui';
import { type ReactNode, useEffect, useRef, useState } from 'react';

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
    models,
}: {
    manifests: ModuleManifest[];
    unreachableIds: Set<string>;
    /** Engine model ids, fetched once by HomePage and shared with the composer. */
    models: string[];
}) {
    const engine = manifests.find((m) => m.id === ENGINE_ID);
    const node = manifests.find((m) => m.id === NODE_ID);
    // Global model/effort selector (issue #34): shell-level persistence, handed
    // off to modules via the documented same-origin localStorage keys.
    const model = usePrefs((s) => s.model);
    const setModel = usePrefs((s) => s.setModel);
    const effort = usePrefs((s) => s.effort);
    const setEffort = usePrefs((s) => s.setEffort);
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
            <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                aria-label={t('全局模型', 'Global model')}
                className="rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-text-secondary"
            >
                <option value="">{t('模型：默认', 'Model: default')}</option>
                {models.map((id) => (
                    <option key={id} value={id}>
                        {id}
                    </option>
                ))}
                {model && !models.includes(model) ? <option value={model}>{model}</option> : null}
            </select>
            <select
                value={effort}
                onChange={(e) => setEffort(e.target.value as Effort)}
                aria-label={t('推理力度', 'Effort')}
                className="rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-text-secondary"
            >
                <option value="default">{t('力度：默认', 'Effort: default')}</option>
                <option value="low">{t('力度：低', 'Effort: low')}</option>
                <option value="medium">{t('力度：中', 'Effort: medium')}</option>
                <option value="high">{t('力度：高', 'Effort: high')}</option>
            </select>
        </div>
    );
}

// SECTION: task sections

const RISK_LABEL: Record<'low' | 'medium' | 'high', [string, string]> = {
    low: ['低风险', 'Low risk'],
    medium: ['中风险', 'Medium risk'],
    high: ['高风险', 'High risk'],
};

/** Approval-first card (issue #33): three actions without opening the module. */
function ApprovalCard({
    task,
    onAction,
    busy,
}: { task: TaskItem; onAction(taskId: string, action: ApprovalAction): void; busy: boolean }) {
    const ap = task.pendingApproval!;
    return (
        <div className="mt-2 rounded-card border border-warning/50 bg-bg-muted p-3">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span aria-hidden>⚠</span>
                {ap.risk ? t(...RISK_LABEL[ap.risk]) : t('待审批', 'Pending approval')}
            </div>
            {ap.prompt ? <div className="mt-1 text-sm text-text-primary">{ap.prompt}</div> : null}
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(task.id, 'reject')}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-error hover:text-error disabled:opacity-50"
                >
                    {t('拒绝', 'Reject')}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(task.id, 'allow_once')}
                    className="rounded-md bg-brand px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                    {t('仅本次允许', 'Allow once')}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(task.id, 'always_allow')}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand disabled:opacity-50"
                >
                    {t('始终允许', 'Always allow')}
                </button>
            </div>
        </div>
    );
}

function TaskRow({
    task,
    moduleLabel,
    onOpen,
    onOpenSpace,
    onApprove,
    approveBusy,
}: {
    task: TaskItem;
    moduleLabel: string;
    onOpen(task: TaskItem): void;
    onOpenSpace(task: TaskItem): void;
    onApprove(taskId: string, action: ApprovalAction): void;
    approveBusy: boolean;
}) {
    return (
        <div className="border-b border-border px-4 py-3 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => onOpen(task)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-text-primary hover:text-brand"
                    title={task.title}
                >
                    {task.title}
                </button>
                {task.space ? (
                    <button
                        type="button"
                        onClick={() => onOpenSpace(task)}
                        title={t('所属项目/空间', 'Owning project/space')}
                        className="shrink-0 rounded-full border border-border bg-bg-muted px-2 py-0.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
                    >
                        {task.space}
                    </button>
                ) : null}
                <span className="shrink-0 text-xs text-text-muted">{moduleLabel}</span>
                {typeof task.progress === 'number' ? (
                    <span className="shrink-0 font-mono text-xs tabular-nums text-text-secondary">
                        {task.progress}%
                    </span>
                ) : null}
                {typeof task.artifacts === 'number' && task.artifacts > 0 ? (
                    <span className="shrink-0 text-xs text-text-muted">
                        {t('产物', 'Artifacts')} {task.artifacts}
                    </span>
                ) : null}
            </div>
            {typeof task.progress === 'number' ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-muted">
                    <div
                        className={`h-full rounded-full transition-all ${task.status === 'failed' || task.status === 'error' ? 'bg-error' : 'bg-running'}`}
                        style={{ width: `${task.progress}%` }}
                    />
                </div>
            ) : null}
            {task.pendingApproval ? (
                <ApprovalCard task={task} onAction={onApprove} busy={approveBusy} />
            ) : null}
        </div>
    );
}

function TaskSection({
    icon,
    title,
    tasks,
    emptyTitle,
    emptyDesc,
    renderRow,
}: {
    icon: string;
    title: string;
    tasks: TaskItem[];
    emptyTitle: string;
    emptyDesc: string;
    renderRow(task: TaskItem): ReactNode;
}) {
    return (
        <section className="rounded-card border border-border bg-bg-elevated">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium text-text-primary">
                <span aria-hidden>{icon}</span>
                {title}
                <span className="text-xs font-normal text-text-muted">{tasks.length}</span>
            </h2>
            {tasks.length === 0 ? (
                <EmptyState title={emptyTitle} description={emptyDesc} />
            ) : (
                tasks.map((task) => renderRow(task))
            )}
        </section>
    );
}

// SECTION: projects/spaces

/** Projects/spaces section (issue #41): module-declared sources grouped by
 *  module, greyed when unreachable, deep-linking into the space view. */
function ProjectsSection({
    manifests,
    unreachableIds,
    itemsByModule,
    lang,
    onOpen,
}: {
    manifests: ModuleManifest[];
    unreachableIds: Set<string>;
    itemsByModule: Map<string, ProjectItem[]>;
    lang: Lang;
    onOpen(m: ModuleManifest, route: string): void;
}) {
    const sources = manifests.filter((m) => (m.homeProjects ?? []).length > 0);
    if (sources.length === 0) return null;
    return (
        <section className="rounded-card border border-border bg-bg-elevated">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium text-text-primary">
                <span aria-hidden>🗂</span>
                {t('项目 / 空间', 'Projects / Spaces')}
            </h2>
            {sources.map((m) => {
                const items = itemsByModule.get(m.id) ?? [];
                const unreachable = unreachableIds.has(m.id);
                return (
                    <div
                        key={m.id}
                        className={`border-b border-border px-4 py-3 last:border-b-0 ${unreachable ? 'opacity-40' : ''}`}
                    >
                        <div className="mb-1 text-xs text-text-muted">{moduleTitle(m, lang)}</div>
                        {unreachable ? (
                            <div className="text-xs text-text-muted">
                                {t('模块暂不可达', 'Module unreachable')}
                            </div>
                        ) : items.length === 0 ? (
                            <div className="text-xs text-text-muted">
                                {t('该模块暂无项目/空间', 'No projects in this module')}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {items.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => onOpen(m, p.route!)}
                                        title={p.description ?? p.title}
                                        className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
                                    >
                                        {p.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </section>
    );
}

// SECTION: page

/** Home landing (issue #32/#33): greeting + status strip + delegation message
 *  box + aggregated task sections (approval-first) + suggested chips. The
 *  message box hands off to the delegation routing (#34). */
export function HomePage({ onOpen }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const unreachableIds = useManifests((s) => s.unreachableIds);
    const user = useAuth((s) => s.user);
    const lang = useLang((l) => l.lang);
    const tasks = useTasks((s) => s.items);
    const approve = useTasks((s) => s.approve);
    const projectItems = useProjects((s) => s.items);
    const [approveBusyId, setApproveBusyId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [engineModels, setEngineModels] = useState<string[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const byId = new Map(manifests.map((m) => [m.id, m]));

    // Engine model list (issue #50): fetched once, shared by the status strip
    // and the composer's model select — one source of truth.
    useEffect(() => {
        void fetchEngineModels().then((ids) => {
            console.log('[home] engine models:', ids.length);
            setEngineModels(ids);
        });
    }, []);

    const running = tasks.filter((x) => taskBucket(x) === 'running');
    const recent = tasks.filter((x) => taskBucket(x) === 'recent');
    const scheduled = tasks.filter((x) => taskBucket(x) === 'scheduled');

    const openTask = (task: TaskItem) => {
        const m = byId.get(task.moduleId);
        if (!m) {
            console.warn('[home] task module missing:', task.moduleId);
            return;
        }
        onOpen(m, task.route, task.title.slice(0, 24));
    };

    // Space chip deep link (issue #41): jump into the owning space view when
    // the module declared one; fall back to the plain module entry.
    const openTaskSpace = (task: TaskItem) => {
        const m = byId.get(task.moduleId);
        if (!m) {
            console.warn('[home] task space module missing:', task.moduleId);
            return;
        }
        onOpen(m, task.spaceRoute ?? undefined, task.space?.slice(0, 24));
    };

    const handleApprove = async (taskId: string, action: ApprovalAction) => {
        setApproveBusyId(taskId);
        try {
            await approve(taskId, action);
            pushToast(
                'success',
                action === 'reject' ? t('已拒绝', 'Rejected') : t('审批已提交', 'Approval sent')
            );
        } catch {
            pushToast('error', t('审批提交失败，请重试', 'Approval failed, please retry'));
        } finally {
            setApproveBusyId(null);
        }
    };

    const renderRow = (task: TaskItem): ReactNode => (
        <TaskRow
            key={task.id}
            task={task}
            moduleLabel={(() => {
                const m = byId.get(task.moduleId);
                return m ? moduleTitle(m, lang) : task.moduleId;
            })()}
            onOpen={openTask}
            onOpenSpace={openTaskSpace}
            onApprove={(id, action) => void handleApprove(id, action)}
            approveBusy={approveBusyId === task.id}
        />
    );

    const manifestChips = manifests.flatMap((m) =>
        (m.home ?? []).filter((c) => c.chip).map((c) => ({ manifest: m, card: c }))
    );

    // Global model/effort prefs feed the shared Composer selects (#55); the
    // same store remains the handoff contract for module iframes (#34).
    const model = usePrefs((s) => s.model);
    const setModel = usePrefs((s) => s.setModel);
    const effort = usePrefs((s) => s.effort);
    const setEffort = usePrefs((s) => s.setEffort);
    const modelOptions = [
        { value: '', label: t('模型：默认', 'Model: default') },
        ...engineModels.map((id) => ({ value: id, label: id })),
        ...(model && !engineModels.includes(model)
            ? [{ value: model, label: model }]
            : []),
    ];

    // Suggestion chips render inside the shared Composer (#55); static chips
    // prefill only, module-declared chips keep their deep link.
    const suggestionChips: ComposerChip[] = [
        ...STATIC_CHIPS.map((c) => ({
            key: c.key,
            label: lang === 'en' ? c.labelEn : c.label,
            onClick: () => prefillChip(c.prefill),
        })),
        ...manifestChips.map(({ manifest, card }) => ({
            key: `${manifest.id}:${card.id}`,
            label: lang === 'en' && card.title_en ? card.title_en : card.title,
            onClick: () => jumpChip(manifest.id, card.route, card.title),
            muted: unreachableIds.has(manifest.id),
        })),
    ];

    const jumpChip = (moduleId: string, route: string, prefill: string) => {
        const m = byId.get(moduleId);
        setDraft(prefill);
        if (m) onOpen(m, route);
        else console.warn('[home] chip target module not registered:', moduleId);
    };

    // Static chips (issue #50): data-fill prefill only — the composer's
    // delegation routing decides where the instruction goes on send.
    const prefillChip = (text: string) => {
        setDraft(text);
        textareaRef.current?.focus();
    };

    // Delegation (issue #34): phase-1 rule routing; the decision is shown,
    // never silent, and every send is audit-logged.
    const chatMessages = useDelegation((s) => s.messages);
    const chatBusy = useDelegation((s) => s.busy);
    const chatError = useDelegation((s) => s.error);
    const ask = useDelegation((s) => s.ask);
    const [lastDecision, setLastDecision] = useState<DelegationDecision | null>(null);

    const send = () => {
        const prompt = draft.trim();
        if (!prompt) return;
        const decision = routeDelegation(prompt);
        setLastDecision(decision);
        logDelegation(
            prompt,
            decision.route,
            lang === 'en' ? decision.reasonEn : decision.reasonZh
        );
        if (decision.route === 'chat') {
            setDraft('');
            void ask(prompt);
            return;
        }
        const targetId = decision.route === 'cowork' ? 'fusion-cowork' : 'fusion-agent-studio';
        const m = byId.get(targetId);
        if (m && decision.handoffRoute) {
            onOpen(m, decision.handoffRoute);
            setDraft('');
        } else {
            console.warn('[home] handoff target not registered:', targetId);
            pushToast(
                'error',
                t('目标模块未注册或未授权', 'Target module not registered or granted')
            );
        }
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
                <header className="flex flex-col gap-2">
                    <h1 className="text-xl font-medium text-text-primary">
                        {greetingText(new Date().getHours(), user?.display_name, lang)}
                    </h1>
                    <StatusStrip
                        manifests={manifests}
                        unreachableIds={unreachableIds}
                        models={engineModels}
                    />
                </header>

                <Composer
                    value={draft}
                    onChange={setDraft}
                    onSubmit={send}
                    busy={chatBusy}
                    placeholder={t(
                        '用自然语言描述任务，引擎会自动决定执行方式… (Enter 发送，Shift+Enter 换行)',
                        'Ask in natural language — the engine handles how… (Enter to send, Shift+Enter for a new line)'
                    )}
                    ariaLabel={t('委托输入框', 'Delegation message box')}
                    hint={t('Enter 发送 · Shift+Enter 换行', 'Enter to send · Shift+Enter new line')}
                    sendLabel={t('发送', 'Send')}
                    busyLabel={t('回答中…', 'Thinking…')}
                    textareaRef={textareaRef}
                    model={{
                        value: model,
                        onChange: setModel,
                        options: modelOptions,
                    }}
                    effort={{
                        value: effort,
                        onChange: (v) => setEffort(v as Effort),
                        options: [
                            { value: 'default', label: t('思考：默认', 'Thinking: auto') },
                            { value: 'low', label: t('思考：低', 'Thinking: low') },
                            { value: 'medium', label: t('思考：中', 'Thinking: medium') },
                            { value: 'high', label: t('思考：高', 'Thinking: high') },
                        ],
                    }}
                    actions={{
                        popoverTitle: 'AGENT CAPABILITIES',
                        emptyLabel: t('暂无可用的能力入口', 'No capability entries yet'),
                        items: composerCapabilities(manifests, lang).map((c) => ({
                            key: `${c.moduleId}:${c.route}`,
                            label: c.title,
                        })),
                    }}
                    chips={suggestionChips}
                />

                {lastDecision ? (
                    <div
                        className="rounded-card border border-border bg-bg-muted px-3 py-2 text-xs text-text-secondary"
                        role="status"
                    >
                        {t('路由决策', 'Routing')}:{' '}
                        {lastDecision.route === 'chat'
                            ? t('壳级问答', 'Shell chat')
                            : lastDecision.route === 'cowork'
                              ? 'Cowork'
                              : 'Agent Studio'}{' '}
                        — {lang === 'en' ? lastDecision.reasonEn : lastDecision.reasonZh}
                    </div>
                ) : null}

                {chatMessages.length > 0 || chatError ? (
                    <section
                        className="max-h-80 overflow-y-auto rounded-card border border-border bg-bg-elevated px-4 py-3"
                        aria-label={t('壳级问答', 'Shell chat')}
                    >
                        <ChatThread
                            messages={[
                                ...chatMessages.map((m, i) => ({
                                    id: String(i),
                                    role: (m.role === 'user' ? 'user' : 'agent') as
                                        | 'user'
                                        | 'agent',
                                    body: m.content,
                                })),
                                ...(chatError
                                    ? [
                                          {
                                              id: 'error',
                                              role: 'error' as const,
                                              body: `${t('问答失败', 'Chat failed')}: ${chatError}`,
                                          },
                                      ]
                                    : []),
                            ]}
                        />
                    </section>
                ) : null}

                <div className="flex flex-col gap-4">
                    <TaskSection
                        icon="▷"
                        title={t('进行中', 'Running')}
                        tasks={running}
                        emptyTitle={t('暂无进行中的任务', 'No running tasks')}
                        emptyDesc={t(
                            '模块任务将跨模块聚合在此展示',
                            'Module tasks will aggregate here across modules'
                        )}
                        renderRow={renderRow}
                    />
                    <TaskSection
                        icon="✓"
                        title={t('最近完成', 'Recently completed')}
                        tasks={recent}
                        emptyTitle={t(
                            '最近完成的任务会出现在这里',
                            'Completed tasks will appear here'
                        )}
                        emptyDesc={t(
                            '完成后可查看产物与引用',
                            'Inspect artifacts and references once done'
                        )}
                        renderRow={renderRow}
                    />
                    <TaskSection
                        icon="⏰"
                        title={t('定时', 'Scheduled')}
                        tasks={scheduled}
                        emptyTitle={t('暂无定时任务', 'No scheduled tasks')}
                        emptyDesc={t(
                            '定时节奏的任务将在此展示',
                            'Scheduled rhythms will surface here'
                        )}
                        renderRow={renderRow}
                    />
                </div>

                <ProjectsSection
                    manifests={manifests}
                    unreachableIds={unreachableIds}
                    itemsByModule={(() => {
                        const map = new Map<string, ProjectItem[]>();
                        for (const p of projectItems) {
                            const list = map.get(p.moduleId) ?? [];
                            list.push(p);
                            map.set(p.moduleId, list);
                        }
                        return map;
                    })()}
                    lang={lang}
                    onOpen={(m, route) => onOpen(m, route)}
                />
            </div>
        </div>
    );
}
