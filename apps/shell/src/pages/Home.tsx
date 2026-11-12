import { fetchShellModels } from '@/api/endpoints';
import { pushToast } from '@/components/ToastHost';
import { composerCapabilities } from '@/lib/composerCapabilities';
import { type ShellModel, modelOptions } from '@/lib/modelCatalog';
import { pickerFilter } from '@/lib/modelPolicy';
import { relativeTime } from '@/lib/relativeTime';
import { useAuth } from '@/stores/auth';
import { logDelegation, routeDelegation, useDelegation } from '@/stores/delegation';
import { t, useLang } from '@/stores/lang';
import type { Lang } from '@/stores/lang';
import { moduleTitle, useManifests } from '@/stores/manifests';
import { useModelPolicy } from '@/stores/modelPolicy';
import { type Effort, usePrefs } from '@/stores/prefs';
import { type ProjectItem, useProjects } from '@/stores/projects';
import { type ApprovalAction, type TaskItem, taskBucket, useTasks } from '@/stores/tasks';
import type { ModuleManifest } from '@/types/manifest';
import type { ComposerChip } from '@fusion/web-ui';
import { ChatThread, Composer } from '@fusion/web-ui';
import { useEffect, useRef, useState } from 'react';

interface Props {
    onOpen(manifest: ModuleManifest, route?: string, pageTitle?: string): void;
}

/** Engine / resident-node ids shown in the Home status footer. Exported
 *  for the registry-match test (#147): these must equal the gateway
 *  manifest ids or the footer renders a false 未注册. */
export const ENGINE_ID = 'fusion-mlx';
export const NODE_ID = 'fusion-multi-nodes';

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
        label: '🧹 整理桌面',
        labelEn: '🧹 Tidy desktop',
        moduleId: 'fusion-cowork',
        route: '/workflows?new=1',
        prefill: '整理桌面',
    },
    {
        key: 'weekly',
        label: '📊 周报 readout',
        labelEn: '📊 Weekly readout',
        moduleId: 'fusion-cowork',
        route: '/workflows?new=1',
        prefill: '生成周报 readout',
    },
    {
        key: 'review',
        label: '💻 代码评审',
        labelEn: '💻 Code review',
        moduleId: 'fusion-agent-studio',
        route: '/canvas?run=1',
        prefill: '代码评审',
    },
    {
        key: 'audit',
        label: '💰 对账',
        labelEn: '💰 Reconcile',
        moduleId: 'fusion-cowork',
        route: '/workflows?new=1',
        prefill: '月度对账',
    },
    {
        key: 'research',
        label: '🔍 研究',
        labelEn: '🔍 Research',
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

function greetingEmoji(hour: number): string {
    if (hour < 12) return '☀️';
    if (hour < 18) return '🌤';
    return '🌙';
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

// SECTION: status footer (issue #86 D5: demoted to one muted line)

function StatusDot({ online, label }: { online: boolean; label: string }) {
    return (
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${online ? 'bg-success' : 'bg-offline'}`}
                aria-hidden
            />
            {label}
        </span>
    );
}

function StatusFooter({
    manifests,
    unreachableIds,
}: {
    manifests: ModuleManifest[];
    unreachableIds: Set<string>;
}) {
    const engine = manifests.find((m) => m.id === ENGINE_ID);
    const node = manifests.find((m) => m.id === NODE_ID);
    return (
        <footer className="flex flex-wrap items-center gap-4 pb-2">
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
        </footer>
    );
}

/** #93: the offline verdict needs loaded manifests — the store starts empty,
 *  so a bare !engine would flash the warning on every cold load. */
export function computeEngineOffline(
    engine: ModuleManifest | undefined,
    unreachableIds: Set<string>,
    manifestsLoaded: boolean
): boolean {
    return manifestsLoaded && (!engine || unreachableIds.has(engine.id));
}

/** Engine-unreachable escalation (issue #86 D5): thin warning strip above the
 *  composer; the normal state shows only the muted footer line. */
function EngineWarning() {
    return (
        <div
            role="alert"
            className="rounded-card border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
            {t(
                '推理引擎不可达，壳级问答与模型列表暂不可用',
                'Inference engine unreachable — shell chat and the model list are unavailable'
            )}
        </div>
    );
}

// SECTION: task cards (issue #86 N7: 2-col card grid)

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
                    className="fs-btn fs-btn-secondary text-xs hover:border-error hover:text-error"
                >
                    {t('拒绝', 'Reject')}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(task.id, 'allow_once')}
                    className="fs-btn fs-btn-primary text-xs"
                >
                    {t('仅本次允许', 'Allow once')}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(task.id, 'always_allow')}
                    className="fs-btn fs-btn-secondary text-xs hover:border-brand hover:text-brand"
                >
                    {t('始终允许', 'Always allow')}
                </button>
            </div>
        </div>
    );
}

function TaskCard({
    task,
    moduleLabel,
    lang,
    onOpen,
    onOpenSpace,
    onApprove,
    approveBusy,
}: {
    task: TaskItem;
    moduleLabel: string;
    lang: Lang;
    onOpen(task: TaskItem): void;
    onOpenSpace(task: TaskItem): void;
    onApprove(taskId: string, action: ApprovalAction): void;
    approveBusy: boolean;
}) {
    const running = taskBucket(task) === 'running';
    return (
        <div className="rounded-card border border-border bg-bg-elevated p-4 hover:border-brand">
            <div className="flex items-start justify-between gap-2">
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
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-text-muted">
                <span className="truncate">{moduleLabel}</span>
                <span className="shrink-0">
                    {relativeTime(task.updatedAt, lang)}
                    {typeof task.artifacts === 'number' && task.artifacts > 0
                        ? ` · ${t('产物', 'Artifacts')} ${task.artifacts}`
                        : ''}
                </span>
            </div>
            {running && typeof task.progress === 'number' ? (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-muted">
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

/** One task section (issue #86 D3): renders only when it has items — empty
 *  sections vanish instead of painting bordered EmptyState boxes. */
function TaskSection({
    icon,
    title,
    tasks,
    lang,
    byId,
    onOpen,
    onOpenSpace,
    onApprove,
    approveBusyId,
}: {
    icon: string;
    title: string;
    tasks: TaskItem[];
    lang: Lang;
    byId: Map<string, ModuleManifest>;
    onOpen(task: TaskItem): void;
    onOpenSpace(task: TaskItem): void;
    onApprove(taskId: string, action: ApprovalAction): void;
    approveBusyId: string | null;
}) {
    if (tasks.length === 0) return null;
    return (
        <section>
            <h2 className="flex items-center gap-2 px-1 pb-2 text-sm font-medium text-text-primary">
                <span aria-hidden>{icon}</span>
                {title}
                <span className="text-xs font-normal text-text-muted">{tasks.length}</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tasks.map((task) => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        lang={lang}
                        moduleLabel={(() => {
                            const m = byId.get(task.moduleId);
                            return m ? moduleTitle(m, lang) : task.moduleId;
                        })()}
                        onOpen={onOpen}
                        onOpenSpace={onOpenSpace}
                        onApprove={onApprove}
                        approveBusy={approveBusyId === task.id}
                    />
                ))}
            </div>
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
                                        className="rounded-full border border-border bg-bg-muted px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand"
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

/** Home landing (issue #32/#33, claude-parity layout #86): serif greeting +
 * composer + standalone chip row; empty task sections vanish (D3); tasks
 * render as a 2-col card grid; the status strip demotes to a muted footer
 * line (D5) escalating to a warning strip when the engine is offline; the
 * routing decision surfaces as a 3s toast; chat is in-place — messages grow
 * above the composer in the same column (N9 hard requirement) and the home
 * chrome collapses while a conversation is active. */
export function HomePage({ onOpen }: Props) {
    const manifests = useManifests((s) => s.manifests);
    const unreachableIds = useManifests((s) => s.unreachableIds);
    const manifestsLoaded = useManifests((s) => s.loaded);
    const user = useAuth((s) => s.user);
    const lang = useLang((l) => l.lang);
    const tasks = useTasks((s) => s.items);
    const approve = useTasks((s) => s.approve);
    const projectItems = useProjects((s) => s.items);
    const [approveBusyId, setApproveBusyId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [shellModels, setShellModels] = useState<ShellModel[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const byId = new Map(manifests.map((m) => [m.id, m]));

    // Model catalog (issue #94): the gateway's session-gated list — local +
    // cloud + alias — fetched once, curated shell-side (issue #87). Any
    // authed session may call it; no module grant is involved.
    useEffect(() => {
        void fetchShellModels().then((models) => {
            console.log('[home] shell model catalog:', models.length);
            setShellModels(models);
        });
        // #114: policy gates the picker (allowlist + privacy) — load once.
        void useModelPolicy.getState().load();
    }, []);

    // Sidebar "new chat" / composer-focus intents (#86/#88): the sidebar
    // dispatches window events so the shell chrome stays decoupled from the
    // Home page internals.
    useEffect(() => {
        const onNewChat = () => {
            useDelegation.getState().clearChat();
            setDraft('');
            textareaRef.current?.focus();
        };
        const onFocusComposer = () => textareaRef.current?.focus();
        window.addEventListener('fusion:new-chat', onNewChat);
        window.addEventListener('fusion:focus-composer', onFocusComposer);
        return () => {
            window.removeEventListener('fusion:new-chat', onNewChat);
            window.removeEventListener('fusion:focus-composer', onFocusComposer);
        };
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

    const sectionProps = {
        lang,
        byId,
        onOpen: openTask,
        onOpenSpace: openTaskSpace,
        onApprove: (id: string, action: ApprovalAction) => void handleApprove(id, action),
        approveBusyId,
    };

    const manifestChips = manifests.flatMap((m) =>
        (m.home ?? []).filter((c) => c.chip).map((c) => ({ manifest: m, card: c }))
    );

    // Global model/effort prefs feed the shared Composer pickers (#55/#87);
    // the same store remains the handoff contract for module iframes (#34).
    const model = usePrefs((s) => s.model);
    const setModel = usePrefs((s) => s.setModel);
    const effort = usePrefs((s) => s.effort);
    const setEffort = usePrefs((s) => s.setEffort);
    // #114: policy-loaded picker — allowlist constrains, local_only hides
    // cloud. Pending policy leaves the catalog untouched (honest degrade).
    const policyState = useModelPolicy((s) => s.policy);
    const policyLoaded = useModelPolicy((s) => s.loaded);
    const policyPending = useModelPolicy((s) => s.gatewayPending);
    const visibleModels =
        policyLoaded && !policyPending ? pickerFilter(shellModels, policyState) : shellModels;
    const modelPickerOptions = modelOptions(visibleModels, t('默认模型', 'Default model'));
    if (model && !visibleModels.some((m) => m.id === model)) {
        modelPickerOptions.push({ value: model, label: model, hint: model, curated: false });
    }

    // Suggestion chips render as a standalone pill row below the composer
    // (issue #86 N4); static chips prefill only, module chips deep-link.
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

    // Delegation (issue #34): phase-1 rule routing; the decision surfaces as
    // a 3s toast (issue #86 N8) and every send is audit-logged.
    const chatMessages = useDelegation((s) => s.messages);
    const chatBusy = useDelegation((s) => s.busy);
    const chatError = useDelegation((s) => s.error);
    const ask = useDelegation((s) => s.ask);
    const stop = useDelegation((s) => s.stop);

    const send = () => {
        const prompt = draft.trim();
        if (!prompt) return;
        const decision = routeDelegation(prompt);
        logDelegation(
            prompt,
            decision.route,
            lang === 'en' ? decision.reasonEn : decision.reasonZh
        );
        const routeLabel =
            decision.route === 'chat'
                ? t('壳级问答', 'Shell chat')
                : decision.route === 'cowork'
                  ? 'Cowork'
                  : 'Agent Studio';
        pushToast(
            'info',
            `${t('路由决策', 'Routing')}: ${routeLabel} — ${lang === 'en' ? decision.reasonEn : decision.reasonZh}`,
            3000
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

    // In-place chat state (N9): once a conversation exists the home chrome
    // (greeting / chips / tasks / footer) collapses — data preserved, layout
    // yields — and the thread scrolls above the bottom-anchored composer.
    const convoActive = chatMessages.length > 0 || !!chatError;

    const thread = (
        <ChatThread
            ariaLabel={t('壳级问答', 'Shell chat')}
            messages={[
                ...chatMessages.map((m, i) => ({
                    id: String(i),
                    role: (m.role === 'user' ? 'user' : 'agent') as 'user' | 'agent',
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
    );

    const composerBlock = (
        <>
            <Composer
                value={draft}
                onChange={setDraft}
                onSubmit={send}
                onStop={stop}
                busy={chatBusy}
                placeholder={t(
                    '描述要完成的任务，/ 查看命令，@ 引用',
                    'Describe the task, / for commands, @ to reference'
                )}
                ariaLabel={t('委托输入框', 'Delegation message box')}
                hint={t('Enter 发送 · Shift+Enter 换行', 'Enter to send · Shift+Enter new line')}
                stopHint={t('· Esc 停止', '· Esc to stop')}
                sendVariant="pill"
                sendLabel={t('发送', 'Send')}
                stopLabel={t('停止', 'Stop')}
                textareaRef={textareaRef}
                slashCommands={{
                    emptyLabel: t('暂无命令', 'No commands yet'),
                    items: STATIC_CHIPS.map((c) => ({
                        key: c.key,
                        label: lang === 'en' ? c.labelEn : c.label,
                        onClick: () => prefillChip(c.prefill),
                    })),
                }}
                references={{
                    emptyLabel: t('暂无可用的能力入口', 'No capability entries yet'),
                    items: composerCapabilities(manifests, lang).map((c) => ({
                        key: `${c.moduleId}:${c.route}`,
                        label: c.title,
                        onClick: () => jumpChip(c.moduleId, c.route, c.title),
                    })),
                }}
                params={{
                    model: {
                        value: model,
                        onChange: setModel,
                        options: modelPickerOptions,
                        fallbackLabel: t('默认模型', 'Default model'),
                    },
                    effort: {
                        value: effort,
                        onChange: (v) => setEffort(v as Effort),
                        options: [
                            { value: 'default', label: t('思考：自动', 'Thinking: auto') },
                            { value: 'low', label: t('思考：低', 'Thinking: low') },
                            { value: 'medium', label: t('思考：中', 'Thinking: medium') },
                            { value: 'high', label: t('思考：高', 'Thinking: high') },
                        ],
                    },
                }}
            />
            {!convoActive && suggestionChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    {suggestionChips.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            onClick={c.onClick}
                            className={`rounded-full border border-border bg-bg-muted px-3 py-1.5 text-xs text-text-secondary hover:border-brand hover:text-brand ${c.muted ? 'opacity-40' : ''}`}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </>
    );

    if (convoActive) {
        return (
            <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 md:px-8">
                        {thread}
                    </div>
                </div>
                <div className="mx-auto w-full max-w-3xl px-4 pb-6 md:px-8">{composerBlock}</div>
            </div>
        );
    }

    const engine = manifests.find((m) => m.id === ENGINE_ID);
    const engineOffline = computeEngineOffline(engine, unreachableIds, manifestsLoaded);

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
                <header>
                    <h1 className="font-serif text-[34px] font-normal leading-tight text-text-primary">
                        <span aria-hidden className="mr-2">
                            {greetingEmoji(new Date().getHours())}
                        </span>
                        {greetingText(new Date().getHours(), user?.display_name, lang)}
                    </h1>
                </header>

                {engineOffline ? <EngineWarning /> : null}

                {composerBlock}

                <div className="flex flex-col gap-6">
                    <TaskSection
                        icon="▷"
                        title={t('进行中', 'Running')}
                        tasks={running}
                        {...sectionProps}
                    />
                    <TaskSection
                        icon="✓"
                        title={t('最近完成', 'Recently completed')}
                        tasks={recent}
                        {...sectionProps}
                    />
                    <TaskSection
                        icon="⏰"
                        title={t('定时', 'Scheduled')}
                        tasks={scheduled}
                        {...sectionProps}
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

                <StatusFooter manifests={manifests} unreachableIds={unreachableIds} />
            </div>
        </div>
    );
}
