import type { StorageAdapter } from './adapters';
import type { MessageRow, ThreadRow, TopicRow } from './types';

export const SCHEMA_VERSION = 1;

/** Composite unique key: every user-scoped row is unique by (clientId, userId,
 *  id) so an offline client replays idempotently on reconnect (issue #155). */
export function rowKey(clientId: string, userId: string, id: string): string {
    return `${clientId}:${userId}:${id}`;
}

export interface NewMessage {
    id: string;
    topicId: string;
    role: MessageRow['role'];
    content: string;
    toolCalls?: Array<Record<string, unknown>>;
    usage?: MessageRow['usage'];
    historySummary?: string;
}

export interface NewTopic {
    id: string;
    sessionId: string;
    title: string;
    status: TopicRow['status'];
    trigger: TopicRow['trigger'];
    pinned?: boolean;
}

export interface NewThread {
    id: string;
    sessionId: string;
    sourceMessageId: string;
    title: string;
}

/** Migrations run in order; v1 creates the three tiers. The runner is
 *  idempotent — a fresh or already-current database just stamps the version. */
const MIGRATIONS: Array<{ version: number; apply: (a: StorageAdapter) => Promise<void> }> = [
    {
        version: 1,
        apply: async () => {
            // Memory adapter needs no store creation; IndexedDB stores are
            // created by the onupgradeneeded hook. Nothing to transform at v1
            // beyond stamping — left as an explicit step so future versions
            // have a template.
            console.log('[conversations] applying schema v1 (three tiers)');
        },
    },
];

export class ConversationStore {
    constructor(
        private adapter: StorageAdapter,
        private clientId: string
    ) {}

    /** Run pending migrations; safe to call on every boot. */
    async migrate(): Promise<number> {
        let v = await this.adapter.getVersion();
        for (const m of MIGRATIONS) {
            if (m.version > v) {
                await m.apply(this.adapter);
                v = m.version;
                await this.adapter.setVersion(v);
            }
        }
        console.log('[conversations] schema version', v);
        return v;
    }

    /** Idempotent upsert — the offline-merge primitive (issue #155). */
    async putMessage(userId: string, msg: NewMessage): Promise<MessageRow> {
        const key = rowKey(this.clientId, userId, msg.id);
        const now = Date.now();
        const prev = await this.adapter.get<MessageRow>('messages', key);
        const row: MessageRow = {
            ...(prev ?? {}),
            ...msg,
            clientId: this.clientId,
            userId,
            createdAt: prev?.createdAt ?? now,
            updatedAt: now,
        };
        await this.adapter.put('messages', key, row);
        return row;
    }

    async putTopic(userId: string, topic: NewTopic): Promise<TopicRow> {
        const key = rowKey(this.clientId, userId, topic.id);
        const now = Date.now();
        const prev = await this.adapter.get<TopicRow>('topics', key);
        const row: TopicRow = {
            ...(prev ?? {}),
            ...topic,
            pinned: topic.pinned ?? prev?.pinned ?? false,
            clientId: this.clientId,
            userId,
            createdAt: prev?.createdAt ?? now,
            updatedAt: now,
        };
        await this.adapter.put('topics', key, row);
        return row;
    }

    async putThread(userId: string, thread: NewThread): Promise<ThreadRow> {
        const key = rowKey(this.clientId, userId, thread.id);
        const now = Date.now();
        const prev = await this.adapter.get<ThreadRow>('threads', key);
        const row: ThreadRow = {
            ...(prev ?? {}),
            ...thread,
            clientId: this.clientId,
            userId,
            createdAt: prev?.createdAt ?? now,
            updatedAt: now,
        };
        await this.adapter.put('threads', key, row);
        return row;
    }

    async listTopicMessages(userId: string, topicId: string): Promise<MessageRow[]> {
        const all = await this.adapter.getAll<MessageRow>('messages');
        return all
            .filter((m) => m.userId === userId && m.topicId === topicId)
            .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    }

    async listSessionTopics(userId: string, sessionId: string): Promise<TopicRow[]> {
        const all = await this.adapter.getAll<TopicRow>('topics');
        return all
            .filter((t) => t.userId === userId && t.sessionId === sessionId)
            .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    }

    async listSessionThreads(userId: string, sessionId: string): Promise<ThreadRow[]> {
        const all = await this.adapter.getAll<ThreadRow>('threads');
        return all.filter((t) => t.userId === userId && t.sessionId === sessionId);
    }

    /** Topic-level cost rollup (issue #155 AC). */
    async rollupTopicCost(
        userId: string,
        topicId: string
    ): Promise<{
        promptTokens: number;
        completionTokens: number;
        costMicros: number;
        messages: number;
    }> {
        const msgs = await this.listTopicMessages(userId, topicId);
        return msgs.reduce(
            (acc, m) => {
                acc.promptTokens += m.usage?.promptTokens ?? 0;
                acc.completionTokens += m.usage?.completionTokens ?? 0;
                acc.costMicros += m.usage?.costMicros ?? 0;
                acc.messages += 1;
                return acc;
            },
            { promptTokens: 0, completionTokens: 0, costMicros: 0, messages: 0 }
        );
    }
}

/** Per-install client id for the (clientId, userId) unique constraint. */
export function clientIdFromStorage(storage: Storage): string {
    const existing = storage.getItem('fusion.conversations.clientId');
    if (existing) return existing;
    const id = `cli-${crypto.randomUUID()}`;
    storage.setItem('fusion.conversations.clientId', id);
    console.log('[conversations] new clientId', id);
    return id;
}
