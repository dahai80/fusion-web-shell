/** Three-tier conversation persistence schema (issue #155, v1).
 *  message = atomic turn; topic = titled segment of a session; thread =
 *  branch anchored on a source message. Branching is data, not copies. */

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

export type TopicStatus = 'active' | 'waitingForHuman' | 'scheduled' | 'failed' | 'closed';

export type TopicTrigger = 'cron' | 'api' | 'chat';

/** Usage rollup fields carried on assistant/tool turns (issue #155). */
export interface MessageUsage {
    promptTokens: number;
    completionTokens: number;
    /** Normalized micro-cost unit so topic rollups sum without conversions. */
    costMicros: number;
}

export interface MessageRow {
    id: string;
    clientId: string;
    userId: string;
    topicId: string;
    role: MessageRole;
    content: string;
    toolCalls?: Array<Record<string, unknown>>;
    usage?: MessageUsage;
    /** Compaction anchor (issue #155): summary text that future turns can
     *  reference instead of replaying the whole topic. */
    historySummary?: string;
    createdAt: number;
    updatedAt: number;
}

export interface TopicRow {
    id: string;
    clientId: string;
    userId: string;
    sessionId: string;
    title: string;
    status: TopicStatus;
    trigger: TopicTrigger;
    pinned: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface ThreadRow {
    id: string;
    clientId: string;
    userId: string;
    sessionId: string;
    /** Fork anchor: the assistant message this thread branches from. */
    sourceMessageId: string;
    title: string;
    createdAt: number;
    updatedAt: number;
}
