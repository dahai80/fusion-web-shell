import { sharedClient } from '@/api/client';
import { pushToast } from '@/components/ToastHost';
import {
    type HealthEntry,
    OFFICE_ROUTES,
    type OfficeArtifact,
    type OfficeRoute,
    dispatchOfficeTask,
    parseOfficeArtifacts,
    parseOfficeRuns,
    probeOfficeHealth,
} from '@/lib/officeCenter';
import { t, useLang } from '@/stores/lang';
import { useManifests } from '@/stores/manifests';
import { useTabs } from '@/stores/tabs';
import { EmptyState } from '@fusion/web-ui';
import {
    BookOpen,
    Boxes,
    FileText,
    LayoutDashboard,
    Presentation,
    RefreshCw,
    Send,
    Table2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Agentic Office command center (issue #191, prototype 01). Chat-first
 * layout (bug3 followup): dispatched tasks and their broker replies render
 * as a conversation with a bottom composer (Enter sends), route selector
 * inline. Runs/artifacts/health zones stay per prototype. Dispatch goes
 * through the fusion-site console tasks BFF — no new execution plane;
 * errors surface verbatim in the thread, never faked.
 */

const COWORK_RUNS_PATH = '/shell/fusion-cowork/api/runs';
const ARTIFACTS_PATH = '/shell/fusion-artifacts/api/v1/artifacts?limit=8';

const ROUTE_META: Record<OfficeRoute, { zh: string; en: string; icon: typeof FileText }> = {
    documents: { zh: '文档', en: 'Documents', icon: FileText },
    sheets: { zh: '表格', en: 'Sheets', icon: Table2 },
    slides: { zh: '演示', en: 'Slides', icon: Presentation },
};

const EXAMPLES: { zh: string; en: string }[] = [
    { zh: '汇总本季表格', en: "Summarize this quarter's sheets" },
    { zh: '起草周报', en: 'Draft the weekly report' },
    { zh: '生成评审 deck', en: 'Generate a review deck' },
    { zh: '合同要点比对', en: 'Compare contract key points' },
];

/** One conversation row: the user's dispatched task or the broker's reply. */
interface ChatMsg {
    id: number;
    kind: 'task' | 'system';
    text: string;
    route?: OfficeRoute;
    ok?: boolean;
    taskId?: string;
    ts: number;
}

const RUN_STATUS_CLS: Record<string, string> = {
    success: 'bg-success/10 text-success',
    running: 'bg-brand/10 text-brand',
    failed: 'bg-error/10 text-error',
    paused: 'bg-warning/10 text-warning',
    pending: 'bg-bg-muted text-text-secondary',
};

function runStatusCls(status: string): string {
    return RUN_STATUS_CLS[status] ?? 'bg-bg-muted text-text-secondary';
}

const HEALTH_CLS: Record<HealthEntry['state'], string> = {
    ok: 'bg-success/10 text-success',
    warn: 'bg-warning/10 text-warning',
    down: 'bg-error/10 text-error',
    no_route: 'bg-bg-muted text-text-secondary',
};

type LoadState = 'loading' | 'ready' | 'error';

export function OfficeCenterPage() {
    useLang((l) => l.lang);
    const [text, setText] = useState('');
    const [route, setRoute] = useState<OfficeRoute>('documents');
    const [dispatching, setDispatching] = useState(false);
    const [msgs, setMsgs] = useState<ChatMsg[]>([]);
    const [runs, setRuns] = useState<ReturnType<typeof parseOfficeRuns>>([]);
    const [runsState, setRunsState] = useState<LoadState>('loading');
    const [artifacts, setArtifacts] = useState<OfficeArtifact[]>([]);
    const [artifactsState, setArtifactsState] = useState<LoadState>('loading');
    const [health, setHealth] = useState<HealthEntry[]>([]);
    const threadRef = useRef<HTMLDivElement | null>(null);
    const nextMsgId = useRef(1);

    const reloadRuns = useCallback(async () => {
        try {
            setRuns(parseOfficeRuns(await sharedClient().get(COWORK_RUNS_PATH, { quiet: true })));
            setRunsState('ready');
        } catch (err) {
            console.warn('[office-center] runs load failed', err);
            setRunsState('error');
        }
    }, []);

    const reloadArtifacts = useCallback(async () => {
        setArtifactsState('loading');
        try {
            setArtifacts(
                parseOfficeArtifacts(await sharedClient().get(ARTIFACTS_PATH, { quiet: true }))
            );
            setArtifactsState('ready');
        } catch (err) {
            console.warn('[office-center] artifacts load failed', err);
            setArtifactsState('error');
        }
    }, []);

    const reloadHealth = useCallback(async () => {
        setHealth(await probeOfficeHealth());
    }, []);

    useEffect(() => {
        void reloadRuns();
        void reloadArtifacts();
        void reloadHealth();
        const runsTimer = setInterval(() => void reloadRuns(), 5000);
        const healthTimer = setInterval(() => void reloadHealth(), 20000);
        return () => {
            clearInterval(runsTimer);
            clearInterval(healthTimer);
        };
    }, [reloadRuns, reloadArtifacts, reloadHealth]);

    const openModule = (moduleId: string, route?: string, title?: string) => {
        const manifest = useManifests.getState().manifests.find((m) => m.id === moduleId);
        if (!manifest) {
            console.warn(`[office-center] module ${moduleId} not registered`);
            pushToast('warning', t('模块未注册', 'Module not registered'));
            return;
        }
        useTabs.getState().openTab(manifest, { route, pageTitle: title });
    };

    const submit = async () => {
        const prompt = text.trim();
        if (!prompt || dispatching) return;
        const taskMsg: ChatMsg = {
            id: nextMsgId.current++,
            kind: 'task',
            text: prompt,
            route,
            ts: Date.now(),
        };
        setMsgs((m) => [...m, taskMsg]);
        setText('');
        setDispatching(true);
        try {
            const { taskId } = await dispatchOfficeTask(route, prompt);
            console.log(`[office-center] dispatched ${taskId} route=${route}`);
            setMsgs((m) => [
                ...m,
                {
                    id: nextMsgId.current++,
                    kind: 'system',
                    ok: true,
                    taskId,
                    text: t('任务已入队', 'Task queued'),
                    ts: Date.now(),
                },
            ]);
        } catch (err) {
            const message = (err as Error).message;
            console.warn('[office-center] dispatch failed', err);
            setMsgs((m) => [
                ...m,
                {
                    id: nextMsgId.current++,
                    kind: 'system',
                    ok: false,
                    text: `${t('派发失败', 'Dispatch failed')}：${message}`,
                    ts: Date.now(),
                },
            ]);
        } finally {
            setDispatching(false);
        }
    };

    // Keep the thread pinned to the newest row; msgCount changes on every
    // appended message and on the dispatching indicator toggling.
    const msgCount = msgs.length + (dispatching ? 1 : 0);
    useEffect(() => {
        if (msgCount === 0) return;
        threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
    }, [msgCount]);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
            <div className="flex items-center gap-2">
                <LayoutDashboard size={18} aria-hidden className="text-brand" />
                <h1 className="text-lg font-semibold text-text-primary">
                    {t('办公指挥中心', 'Office Command Center')}
                </h1>
                <span className="text-xs text-text-muted">
                    {t('本地离线 · 聚合调度', 'Local offline · unified dispatch')}
                </span>
            </div>

            {/* Zone 1 (top): task thread + chat composer (bug3: chat-style,
                Enter sends, broker replies render inline) */}
            <section className="hair-card flex flex-col">
                <div
                    ref={threadRef}
                    className="flex max-h-80 min-h-36 flex-col gap-2 overflow-y-auto p-4"
                    aria-live="polite"
                >
                    {msgs.length === 0 ? (
                        <div className="m-auto text-center text-xs text-text-muted">
                            {t(
                                '用自然语言描述办公任务，回车发送；结果以任务回执形式出现在这里。',
                                'Describe an office task in natural language and press Enter; broker replies land here.'
                            )}
                        </div>
                    ) : (
                        msgs.map((m) =>
                            m.kind === 'task' ? (
                                <div key={m.id} className="flex justify-end">
                                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand/10 px-3 py-2 text-sm text-text-primary">
                                        {m.text}
                                        <span className="ml-2 text-[11px] text-text-muted">
                                            {(() => {
                                                const meta = ROUTE_META[m.route ?? 'documents'];
                                                return meta ? t(meta.zh, meta.en) : '';
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div key={m.id} className="flex justify-start">
                                    <div
                                        role={m.ok ? 'status' : 'alert'}
                                        className={`max-w-[80%] rounded-2xl rounded-bl-sm border px-3 py-2 text-sm ${
                                            m.ok
                                                ? 'border-hairline bg-success/5 text-text-secondary'
                                                : 'border-hairline bg-error/5 text-error'
                                        }`}
                                    >
                                        {m.text}
                                        {m.taskId ? (
                                            <span className="ml-1 font-mono text-[11px] text-text-muted">
                                                {m.taskId}
                                            </span>
                                        ) : null}
                                        {m.ok ? (
                                            <div className="mt-0.5 text-[11px] text-text-muted">
                                                {t(
                                                    '设备离线时停留在 broker 信箱（TTL 24h），上线后自动领取。',
                                                    'If the device is offline the task waits in the broker mailbox (TTL 24h).'
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        )
                    )}
                    {dispatching ? (
                        <div className="flex justify-start">
                            <div className="rounded-2xl rounded-bl-sm border border-hairline px-3 py-2 text-xs text-text-muted">
                                {t('派发中…', 'Dispatching…')}
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="border-t border-hairline p-3">
                    <div className="flex items-end gap-2">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    !e.shiftKey &&
                                    !e.nativeEvent.isComposing
                                ) {
                                    e.preventDefault();
                                    void submit();
                                }
                            }}
                            rows={1}
                            placeholder={t(
                                '例：把 Q3 华东销售数据做成演示，并给团队建跟进任务…（回车发送）',
                                'e.g. Turn the Q3 sales sheet into a deck… (Enter to send)'
                            )}
                            className="field max-h-32 min-h-9 flex-1 resize-none py-2"
                        />
                        <button
                            type="button"
                            disabled={dispatching || !text.trim()}
                            onClick={() => void submit()}
                            aria-label={t('发送任务', 'Send task')}
                            className="pill flex items-center gap-1"
                        >
                            <Send size={14} aria-hidden />
                            {t('发送', 'Send')}
                        </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {OFFICE_ROUTES.map((r) => {
                            const meta = ROUTE_META[r];
                            const Icon = meta.icon;
                            return (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setRoute(r)}
                                    aria-pressed={route === r}
                                    className={`flex items-center gap-1 rounded-pill px-3 py-1 text-xs ${
                                        route === r
                                            ? 'bg-brand/10 text-brand'
                                            : 'bg-bg-muted text-text-muted hover:text-text-primary'
                                    }`}
                                >
                                    <Icon size={13} aria-hidden />
                                    {t(meta.zh, meta.en)}
                                </button>
                            );
                        })}
                        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                        {EXAMPLES.map((ex) => (
                            <button
                                key={ex.en}
                                type="button"
                                onClick={() => setText(ex.zh)}
                                className="rounded-pill bg-bg-muted px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                            >
                                {t(ex.zh, ex.en)}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                {/* Zone 2 (left): active agent runs */}
                <section className="hair-card p-4 md:col-span-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium text-text-primary">
                            {t('进行中的 Agent 任务', 'Active agent tasks')}
                        </h2>
                        <button
                            type="button"
                            onClick={() =>
                                openModule(
                                    'fusion-cowork',
                                    undefined,
                                    t('任务编排', 'Orchestration')
                                )
                            }
                            className="flex items-center gap-1 text-xs text-brand underline"
                        >
                            <Boxes size={13} aria-hidden />
                            {t('打开编排', 'Open orchestration')}
                        </button>
                    </div>
                    {runsState === 'error' ? (
                        <EmptyState
                            title={t('运行列表不可用', 'Run list unavailable')}
                            description={t(
                                'cowork 运行接口无响应，恢复后自动重试。',
                                'The cowork runs API is unreachable; it retries automatically.'
                            )}
                        />
                    ) : runs.length === 0 && runsState === 'ready' ? (
                        <EmptyState
                            title={t('暂无运行', 'No runs')}
                            description={t(
                                '上方命令栏发起任务后，DAG 运行会出现在这里。',
                                'Dispatch a task above and DAG runs will appear here.'
                            )}
                        />
                    ) : (
                        <ul className="mt-2 flex flex-col gap-2">
                            {runs.slice(0, 8).map((r) => (
                                <li key={r.runId} className="rounded-xl border border-hairline p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-medium text-text-primary">
                                            {r.name || r.runId}
                                        </span>
                                        <span
                                            className={`shrink-0 rounded-pill px-2 py-0.5 text-[11px] ${runStatusCls(r.status)}`}
                                        >
                                            {r.status}
                                        </span>
                                    </div>
                                    <div className="mt-1 truncate text-[11px] text-text-muted">
                                        {r.workflowId || '—'}
                                        {r.error ? ` · ${r.error}` : ''}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Zone 3 (right): recent artifacts + knowledge QA entry */}
                <section className="flex flex-col gap-4 md:col-span-2">
                    <div className="hair-card p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium text-text-primary">
                                {t('最近产物', 'Recent artifacts')}
                            </h2>
                            <button
                                type="button"
                                onClick={() => void reloadArtifacts()}
                                aria-label={t('刷新产物', 'Refresh artifacts')}
                                className="rounded p-1 text-text-muted hover:text-text-primary"
                            >
                                <RefreshCw size={13} aria-hidden />
                            </button>
                        </div>
                        {artifactsState === 'error' ? (
                            <EmptyState title={t('产物接口不可用', 'Artifacts API unavailable')} />
                        ) : artifacts.length === 0 && artifactsState === 'ready' ? (
                            <EmptyState title={t('暂无产物', 'No artifacts')} />
                        ) : (
                            <ul className="mt-2 flex flex-col gap-1.5">
                                {artifacts.slice(0, 6).map((a) => (
                                    <li
                                        key={a.id}
                                        className="flex items-center justify-between gap-2 text-xs"
                                    >
                                        <span className="truncate text-text-primary">{a.name}</span>
                                        <span className="shrink-0 rounded-pill bg-bg-muted px-2 py-0.5 text-[11px] text-text-muted">
                                            v{a.version}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <button
                            type="button"
                            onClick={() =>
                                openModule('fusion-artifacts', t('产物库', 'Artifact library'))
                            }
                            className="mt-3 flex items-center gap-1 text-xs text-brand underline"
                        >
                            {t('打开产物库', 'Open artifact library')}
                        </button>
                    </div>
                    <div className="hair-card p-4">
                        <h2 className="text-sm font-medium text-text-primary">
                            {t('知识问答', 'Knowledge QA')}
                        </h2>
                        <p className="mt-1 text-xs text-text-muted">
                            {t(
                                '对本地知识库提问，检索历史产物与文档。',
                                'Query the local knowledge base; searches past artifacts and docs.'
                            )}
                        </p>
                        <button
                            type="button"
                            onClick={() =>
                                openModule('fusion-rag', undefined, t('知识问答', 'Knowledge QA'))
                            }
                            className="mt-3 flex items-center gap-1 text-xs text-brand underline"
                        >
                            <BookOpen size={13} aria-hidden />
                            {t('打开知识问答', 'Open knowledge QA')}
                        </button>
                    </div>
                </section>
            </div>

            {/* Zone 4 (bottom): service health strip */}
            <section className="hair-card p-3" aria-label={t('服务健康', 'Service health')}>
                <div className="flex flex-wrap items-center gap-2">
                    {health.length === 0 ? (
                        <span className="text-xs text-text-muted">{t('探测中…', 'Probing…')}</span>
                    ) : (
                        health.map((h) => (
                            <span
                                key={h.id}
                                title={`${h.id}${h.port ? ` :${h.port}` : ''} — ${h.detail}`}
                                className={`flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] ${HEALTH_CLS[h.state]}`}
                            >
                                <span aria-hidden>●</span>
                                {t(h.label, h.labelEn)}
                                {h.state === 'no_route' ? ` · ${t('无网关路由', 'no route')}` : ''}
                            </span>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
