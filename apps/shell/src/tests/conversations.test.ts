import { describe, expect, it } from 'bun:test';
import { MemoryAdapter } from '../lib/conversations/adapters';
import { ConversationStore, clientIdFromStorage, rowKey } from '../lib/conversations/store';

function store(): ConversationStore {
    return new ConversationStore(new MemoryAdapter(), 'cli-test-1');
}

describe('conversation persistence schema (#155)', () => {
    it('migrates a fresh database to v1 and is idempotent on re-run', async () => {
        const s = store();
        expect(await s.migrate()).toBe(1);
        expect(await s.migrate()).toBe(1);
    });

    it('offline upsert replay is idempotent — same key never duplicates', async () => {
        const s = store();
        await s.migrate();
        await s.putTopic('u1', {
            id: 't1',
            sessionId: 's1',
            title: 'topic one',
            status: 'active',
            trigger: 'chat',
        });
        const base = { id: 'm1', topicId: 't1', role: 'user' as const, content: 'hello' };
        const r1 = await s.putMessage('u1', base);
        const r2 = await s.putMessage('u1', base);
        expect(r2.id).toBe(r1.id);
        const msgs = await s.listTopicMessages('u1', 't1');
        expect(msgs.length).toBe(1);
        // Upsert refreshes content without duplicating (offline edit merge);
        // createdAt stays the original write time.
        await s.putMessage('u1', { ...base, content: 'hello (edited offline)' });
        const after = await s.listTopicMessages('u1', 't1');
        expect(after.length).toBe(1);
        expect(after[0]?.content).toBe('hello (edited offline)');
        expect(after[0]?.createdAt).toBe(r1.createdAt);
    });

    it('keys are scoped by (clientId, userId) — other users do not collide', async () => {
        const s = store();
        await s.migrate();
        const base = { id: 'm1', topicId: 't1', role: 'user' as const, content: 'x' };
        await s.putMessage('u1', base);
        await s.putMessage('u2', base);
        expect((await s.listTopicMessages('u1', 't1')).length).toBe(1);
        expect((await s.listTopicMessages('u2', 't1')).length).toBe(1);
        expect(rowKey('c', 'u1', 'm1')).not.toBe(rowKey('c', 'u2', 'm1'));
    });

    it('topic cost rollup sums usage across messages', async () => {
        const s = store();
        await s.migrate();
        await s.putTopic('u1', {
            id: 't2',
            sessionId: 's1',
            title: 'costly',
            status: 'active',
            trigger: 'api',
        });
        await s.putMessage('u1', {
            id: 'a1',
            topicId: 't2',
            role: 'assistant',
            content: 'r1',
            usage: { promptTokens: 100, completionTokens: 20, costMicros: 500 },
        });
        await s.putMessage('u1', {
            id: 'a2',
            topicId: 't2',
            role: 'assistant',
            content: 'r2',
            usage: { promptTokens: 50, completionTokens: 30, costMicros: 250 },
        });
        await s.putMessage('u1', { id: 'a3', topicId: 't2', role: 'user', content: 'no usage' });
        const roll = await s.rollupTopicCost('u1', 't2');
        expect(roll.promptTokens).toBe(150);
        expect(roll.completionTokens).toBe(50);
        expect(roll.costMicros).toBe(750);
        expect(roll.messages).toBe(3);
    });

    it('thread branches are data — anchored on a source message', async () => {
        const s = store();
        await s.migrate();
        await s.putThread('u1', {
            id: 'th1',
            sessionId: 's1',
            sourceMessageId: 'a1',
            title: 'fork: try harder',
        });
        const threads = await s.listSessionThreads('u1', 's1');
        expect(threads.length).toBe(1);
        expect(threads[0]?.sourceMessageId).toBe('a1');
    });

    it('historySummary compaction anchor survives on the message row', async () => {
        const s = store();
        await s.migrate();
        const r = await s.putMessage('u1', {
            id: 'sum1',
            topicId: 't1',
            role: 'system',
            content: '',
            historySummary: 'prior turns: user asked about X, assistant answered Y',
        });
        expect(r.historySummary).toBe('prior turns: user asked about X, assistant answered Y');
    });

    it('clientId persists from storage and is generated once', () => {
        const mem = new Map<string, string>();
        const fake = {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
        } as Storage;
        const a = clientIdFromStorage(fake);
        const b = clientIdFromStorage(fake);
        expect(a).toBe(b);
    });
});
