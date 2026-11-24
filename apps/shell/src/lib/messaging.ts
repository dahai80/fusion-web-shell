import { sharedClient } from '@/api/client';

/**
 * Customer messaging service client (issue #186): operator↔customer ticket
 * threads scoped to factory orders. Contract from issue #186 (server owner
 * still pending — the gateway will proxy /api/messaging to the owner service
 * once it lands); auth = the existing shell session Bearer (identity token
 * upstream). Pure parsers are test-pinned so the wire shape stays fixed
 * while the backend is built.
 *
 *   GET  /api/messaging/conversations                 list (caller-scoped)
 *   POST /api/messaging/conversations                 open {scope, ref, subject}
 *   GET  /api/messaging/conversations/{id}/messages   thread read (?after=)
 *   POST /api/messaging/conversations/{id}/messages   reply {content}
 *   PATCH /api/messaging/conversations/{id}           status chip (operator)
 */

const MESSAGING_PREFIX = '/api/messaging';

export type ConversationStatus =
    | 'open'
    | 'triaged'
    | 'in-progress'
    | 'fixed'
    | 'awaiting-customer'
    | 'closed';

export const CONVERSATION_STATUSES: readonly ConversationStatus[] = [
    'open',
    'triaged',
    'in-progress',
    'fixed',
    'awaiting-customer',
    'closed',
];

export interface Conversation {
    id: string;
    scope: string;
    ref: string;
    subject: string;
    status: ConversationStatus;
    linkedIssueId: string;
    updatedAt: number;
    unread: number;
}

export interface ThreadMessage {
    id: string;
    conversationId: string;
    sender: string;
    senderRole: 'customer' | 'operator' | 'system';
    content: string;
    ts: number;
}

interface RawConversation {
    id?: unknown;
    scope?: unknown;
    ref?: unknown;
    subject?: unknown;
    status?: unknown;
    linked_issue_id?: unknown;
    updated_at?: unknown;
    unread?: unknown;
}

interface RawMessage {
    id?: unknown;
    conversation_id?: unknown;
    sender?: unknown;
    sender_role?: unknown;
    content?: unknown;
    ts?: unknown;
}

const STATUS_SET: ReadonlySet<string> = new Set(CONVERSATION_STATUSES);

function asString(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function asNumber(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Normalize a status chip, defaulting unknown/missing to 'open'. */
export function parseStatus(v: unknown): ConversationStatus {
    return typeof v === 'string' && STATUS_SET.has(v) ? (v as ConversationStatus) : 'open';
}

function normalizeRole(v: unknown): ThreadMessage['senderRole'] {
    return v === 'customer' || v === 'operator' || v === 'system' ? v : 'operator';
}

/** Filter + normalize the conversation list (pure, test-pinned). */
export function parseConversations(payload: unknown): Conversation[] {
    const rows =
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { conversations?: unknown }).conversations)
            ? ((payload as { conversations: unknown[] }).conversations as RawConversation[])
            : [];
    const out: Conversation[] = [];
    for (const r of rows) {
        const id = asString(r.id).trim();
        if (!id) continue;
        out.push({
            id,
            scope: asString(r.scope),
            ref: asString(r.ref),
            subject: asString(r.subject),
            status: parseStatus(r.status),
            linkedIssueId: asString(r.linked_issue_id),
            updatedAt: asNumber(r.updated_at),
            unread: asNumber(r.unread),
        });
    }
    return out;
}

/** Filter + normalize a thread page (pure, test-pinned). */
export function parseMessages(payload: unknown): ThreadMessage[] {
    const rows =
        payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { messages?: unknown }).messages)
            ? ((payload as { messages: unknown[] }).messages as RawMessage[])
            : [];
    const out: ThreadMessage[] = [];
    for (const r of rows) {
        const id = asString(r.id).trim();
        if (!id) continue;
        out.push({
            id,
            conversationId: asString(r.conversation_id),
            sender: asString(r.sender),
            senderRole: normalizeRole(r.sender_role),
            content: asString(r.content),
            ts: asNumber(r.ts),
        });
    }
    return out;
}

/** Conversations for the caller (operator sees all factory-order threads). */
export async function fetchConversations(): Promise<Conversation[]> {
    const data = await sharedClient().get<{ conversations?: RawConversation[] }>(
        `${MESSAGING_PREFIX}/conversations`,
        { quiet: true }
    );
    return parseConversations(data);
}

/** Thread read; `after` = server message id — only newer rows come back. */
export async function fetchMessages(id: string, after?: string): Promise<ThreadMessage[]> {
    const q = after ? `?after=${encodeURIComponent(after)}` : '';
    const data = await sharedClient().get<{ messages?: RawMessage[] }>(
        `${MESSAGING_PREFIX}/conversations/${encodeURIComponent(id)}/messages${q}`,
        { quiet: true }
    );
    return parseMessages(data);
}

/** Open a conversation: {scope:'factory_order', ref:'<order_no>', subject}. */
export async function openConversation(params: {
    scope: string;
    ref: string;
    subject: string;
}): Promise<void> {
    await sharedClient().post(`${MESSAGING_PREFIX}/conversations`, params, { quiet: true });
}

/** Operator/customer reply. */
export async function postMessage(id: string, content: string): Promise<void> {
    await sharedClient().post(
        `${MESSAGING_PREFIX}/conversations/${encodeURIComponent(id)}/messages`,
        { content },
        { quiet: true }
    );
}

/** Operator status chip update (triaged/in-progress/fixed/awaiting-customer/closed). */
export async function setConversationStatus(id: string, status: ConversationStatus): Promise<void> {
    await sharedClient().patch(`${MESSAGING_PREFIX}/conversations/${encodeURIComponent(id)}`, {
        status,
    });
}
