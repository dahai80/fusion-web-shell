import './setup';
import { beforeEach, describe, expect, it } from 'bun:test';
import {
    logDelegation,
    recentDelegations,
    routeDelegation,
    setChatPoster,
    useDelegation,
} from '../stores/delegation';
import { loadPrefs, usePrefs } from '../stores/prefs';

describe('delegation routing (issue #34, phase 1 rules)', () => {
    it('routes orchestration/agent-flavored prompts to agent-studio', () => {
        for (const p of ['编排一个多步 agent 帮我发布周报', 'run a multi-step agent pipeline']) {
            const d = routeDelegation(p);
            expect(d.route).toBe('agent-studio');
            expect(d.reasonZh.length).toBeGreaterThan(0);
            expect(d.reasonEn.length).toBeGreaterThan(0);
        }
    });

    it('routes task-verb prompts to cowork', () => {
        for (const p of [
            '整理桌面',
            '生成月度对账报告',
            'reconcile the books and run the report',
        ]) {
            const d = routeDelegation(p);
            expect(d.route).toBe('cowork');
        }
    });

    it('routes plain questions to shell chat', () => {
        for (const p of ['今天天气怎么样？', 'what is a DAG?', '帮我看看这个词什么意思']) {
            const d = routeDelegation(p);
            expect(d.route).toBe('chat');
        }
    });

    it('studio hints win over task verbs, questions fall through to chat', () => {
        expect(routeDelegation('编排 agent 整理桌面').route).toBe('agent-studio');
        expect(routeDelegation('这是工作流吗').route).toBe('chat');
    });

    it('empty prompt stays unrouted', () => {
        expect(routeDelegation('   ').route).toBe('chat');
    });
});

describe('delegation audit log (issue #34)', () => {
    beforeEach(() => {
        localStorage.removeItem('fusion.shell.delegations');
    });

    it('records every delegation with its route and caps at 50', () => {
        for (let i = 0; i < 55; i++) {
            logDelegation(`prompt ${i}`, 'cowork', '任务动词命中');
        }
        const log = recentDelegations();
        expect(log).toHaveLength(50);
        expect(log[0]!.prompt).toBe('prompt 5');
        expect(log[49]!.prompt).toBe('prompt 54');
        expect(log[0]!.route).toBe('cowork');
        expect(typeof log[0]!.ts).toBe('number');
    });
});

describe('shell-level chat (issue #34)', () => {
    beforeEach(() => {
        useDelegation.setState({ messages: [], busy: false });
        usePrefs.setState({ model: '', effort: 'default' });
        setChatPoster(async () => ({
            choices: [{ message: { role: 'assistant', content: '你好，我是 Fusion。' } }],
        }));
    });

    it('asks the gateway with history and appends the reply', async () => {
        await useDelegation.getState().ask('你好');
        await useDelegation.getState().ask('再介绍一下你自己');
        const messages = useDelegation.getState().messages;
        expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
        expect(messages[1]!.content).toBe('你好，我是 Fusion。');
    });

    it('posts model + history to the shell chat endpoint', async () => {
        const calls: unknown[] = [];
        setChatPoster(async (body) => {
            calls.push(body);
            return { choices: [{ message: { role: 'assistant', content: 'ok' } }] };
        });
        usePrefs.setState({ model: 'qwen3.5-32b' });
        await useDelegation.getState().ask('你好');
        const body = calls[0] as { model: string; messages: unknown[]; stream: boolean };
        expect(body.model).toBe('qwen3.5-32b');
        expect(body.stream).toBe(false);
        expect(body.messages).toEqual([{ role: 'user', content: '你好' }]);
    });

    it('keeps history and surfaces errors on failure', async () => {
        setChatPoster(async () => {
            throw new Error('engine down');
        });
        await useDelegation
            .getState()
            .ask('你好')
            .catch(() => undefined);
        const s = useDelegation.getState();
        expect(s.messages.map((m) => m.role)).toEqual(['user']);
        expect(s.error).toBe('engine down');
    });
});

describe('global model/effort prefs (issue #34)', () => {
    beforeEach(() => {
        localStorage.clear();
        usePrefs.setState({ model: '', effort: 'default' });
    });

    it('persists model and effort to the documented shell keys', () => {
        usePrefs.getState().setModel('qwen3.5-32b');
        usePrefs.getState().setEffort('high');
        expect(localStorage.getItem('fusion.shell.model')).toBe('qwen3.5-32b');
        expect(localStorage.getItem('fusion.shell.effort')).toBe('high');
    });

    it('restores prefs from localStorage', () => {
        localStorage.setItem('fusion.shell.model', 'glm-4');
        localStorage.setItem('fusion.shell.effort', 'low');
        expect(loadPrefs()).toEqual({ model: 'glm-4', effort: 'low' });
    });
});
