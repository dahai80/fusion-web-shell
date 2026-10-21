import { sharedClient } from '@/api/client';
import { usePrefs } from '@/stores/prefs';
import { create } from 'zustand';

/**
 * Home delegation entry (issue #34): phase-1 rule routing — task-flavored
 * prompts deep-link into cowork delegate / agent-studio Composer with the
 * prompt prefilled, plain questions are answered by the shell-level chat
 * (gateway session-gated LLM, fusion-gateway#267). The routing decision is
 * always shown to the user and every delegation is audit-logged.
 */

export type DelegationRoute = 'chat' | 'cowork' | 'agent-studio';

export interface DelegationDecision {
    route: DelegationRoute;
    reasonZh: string;
    reasonEn: string;
    /** Module-relative deep-link route for module handoffs. */
    handoffRoute?: string;
}

const STUDIO_RE =
    /编排|画布|多步|代理|agent|composer|canvas|graph|pipeline|workflow orchestration/i;
const TASK_RE =
    /整理|生成|对账|跑一|执行|批量|定时|工作流|创建|建一个|写一份|做一份|做一个|周报|日报|评审|审查|分析|汇总|归档|run|create|generate|reconcile|schedule|organize|summar|review|analyz/i;
const QUESTION_RE =
    /^(什么|怎么|为什么|是不是|是否|哪|怎么|how|what|why|which|is|are|can|does|do)\b|吗[？?]?$|[？?]$/i;

export function routeDelegation(prompt: string): DelegationDecision {
    const p = prompt.trim();
    if (!p) return { route: 'chat', reasonZh: '空输入', reasonEn: 'Empty input' };
    if (STUDIO_RE.test(p))
        return {
            route: 'agent-studio',
            reasonZh: '包含编排 / Agent 关键词，交给 Agent Studio 编排',
            reasonEn: 'Orchestration / agent keywords — handed to Agent Studio',
            handoffRoute: `/canvas?run=1&prompt=${encodeURIComponent(p)}`,
        };
    if (QUESTION_RE.test(p))
        return {
            route: 'chat',
            reasonZh: '看起来是个问题，由壳级问答回答',
            reasonEn: 'Looks like a question — answered by the shell chat',
        };
    if (TASK_RE.test(p))
        return {
            route: 'cowork',
            reasonZh: '任务动词命中，交给 Cowork 工作流委托',
            reasonEn: 'Task verb matched — handed to the Cowork delegate',
            handoffRoute: `/workflows?new=1&prompt=${encodeURIComponent(p)}`,
        };
    return {
        route: 'chat',
        reasonZh: '未命中任务路由，由壳级问答回答',
        reasonEn: 'No task route matched — answered by the shell chat',
    };
}

const AUDIT_KEY = 'fusion.shell.delegations';
const AUDIT_CAP = 50;

export interface DelegationRecord {
    ts: number;
    prompt: string;
    route: DelegationRoute;
    reason: string;
}

export function logDelegation(prompt: string, route: DelegationRoute, reason: string): void {
    try {
        const raw = localStorage.getItem(AUDIT_KEY);
        const list = raw ? (JSON.parse(raw) as unknown) : [];
        const records = Array.isArray(list) ? (list as DelegationRecord[]) : [];
        records.push({ ts: Date.now(), prompt: prompt.slice(0, 120), route, reason });
        localStorage.setItem(AUDIT_KEY, JSON.stringify(records.slice(-AUDIT_CAP)));
    } catch (err) {
        console.warn('[delegation] audit log failed', err);
    }
}

export function recentDelegations(): DelegationRecord[] {
    try {
        const raw = localStorage.getItem(AUDIT_KEY);
        const list = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(list) ? (list as DelegationRecord[]).slice(-AUDIT_CAP) : [];
    } catch (err) {
        console.warn('[delegation] audit log read failed', err);
        return [];
    }
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatResponse {
    choices?: Array<{ message?: { role?: string; content?: string } }>;
}

export type ChatPostFn = (body: {
    model: string;
    messages: ChatMessage[];
    stream: boolean;
}) => Promise<ChatResponse>;

let chatPoster: ChatPostFn = (body) => sharedClient().post('/api/v1/shell/chat/completions', body);

/** Test seam: swap the chat HTTP layer. */
export function setChatPoster(fn: ChatPostFn): void {
    chatPoster = fn;
}

interface DelegationState {
    messages: ChatMessage[];
    busy: boolean;
    error: string | null;
    /** Last routing decision, always surfaced in the UI (never silent). */
    lastDecision: DelegationDecision | null;
    ask(prompt: string): Promise<void>;
    clearChat(): void;
}

const HISTORY_CAP = 20;

export const useDelegation = create<DelegationState>((set, get) => ({
    messages: [],
    busy: false,
    error: null,
    lastDecision: null,

    async ask(prompt) {
        const p = prompt.trim();
        if (!p || get().busy) return;
        const history = [...get().messages, { role: 'user' as const, content: p }].slice(
            -HISTORY_CAP
        );
        set({ messages: history, busy: true, error: null });
        try {
            const resp = await chatPoster({
                model: usePrefs.getState().model,
                messages: history,
                stream: false,
            });
            const content = resp.choices?.[0]?.message?.content?.trim();
            if (!content) throw new Error('empty response');
            set({
                messages: [...history, { role: 'assistant', content }],
                busy: false,
            });
            console.log('[delegation] chat reply received,', content.length, 'chars');
        } catch (err) {
            console.error('[delegation] chat failed', err);
            set({ busy: false, error: (err as Error).message });
        }
    },

    clearChat() {
        set({ messages: [], error: null });
    },
}));
