import { describe, expect, it } from 'bun:test';
import { parseConversations, parseMessages, parseStatus } from '../lib/messaging';

/**
 * Messaging service client contract (issue #186), pinned to the proposed
 * wire shape: /api/messaging/conversations (list/open), .../{id}/messages
 * (thread read/reply). Server owner still pending — parsers freeze the
 * contract so the backend can be built against these tests.
 */

describe('parseConversations (issue #186)', () => {
    it('normalizes rows and maps snake_case fields', () => {
        const convs = parseConversations({
            conversations: [
                {
                    id: 'conv-1',
                    scope: 'factory_order',
                    ref: 'ORD-2026-001',
                    subject: 'Dashboard MVP thread',
                    status: 'in-progress',
                    linked_issue_id: '143',
                    updated_at: 1795550000.5,
                    unread: 2,
                },
                { id: 'conv-2', status: 'weird', subject: '' },
            ],
        });
        expect(convs).toHaveLength(2);
        expect(convs[0]).toEqual({
            id: 'conv-1',
            scope: 'factory_order',
            ref: 'ORD-2026-001',
            subject: 'Dashboard MVP thread',
            status: 'in-progress',
            linkedIssueId: '143',
            updatedAt: 1795550000.5,
            unread: 2,
        });
        // Unknown status chip degrades to 'open', missing strings to ''.
        expect(convs[1]!.status).toBe('open');
        expect(convs[1]!.scope).toBe('');
        expect(convs[1]!.unread).toBe(0);
    });

    it('drops rows without an id and degrades invalid payloads to empty', () => {
        expect(parseConversations({ conversations: [{ subject: 'no id' }] })).toEqual([]);
        expect(parseConversations(undefined)).toEqual([]);
        expect(parseConversations(null)).toEqual([]);
        expect(parseConversations({ conversations: 'nope' })).toEqual([]);
        expect(parseConversations({})).toEqual([]);
    });
});

describe('parseMessages (issue #186)', () => {
    it('normalizes the thread page with role validation', () => {
        const msgs = parseMessages({
            messages: [
                {
                    id: 'm1',
                    conversation_id: 'conv-1',
                    sender: 'customer-alice',
                    sender_role: 'customer',
                    content: '什么时候能上线？',
                    ts: 1795550000,
                },
                { id: 'm2', sender_role: 'operator', content: '本周内。' },
                { id: 'm3', sender_role: 'not-a-role' },
            ],
        });
        expect(msgs).toHaveLength(3);
        expect(msgs[0]!.senderRole).toBe('customer');
        expect(msgs[1]!.conversationId).toBe('');
        expect(msgs[2]!.senderRole).toBe('operator');
    });

    it('drops rows without an id and degrades invalid payloads to empty', () => {
        expect(parseMessages({ messages: [{ content: 'no id' }] })).toEqual([]);
        expect(parseMessages(undefined)).toEqual([]);
        expect(parseMessages({ messages: 42 })).toEqual([]);
    });
});

describe('parseStatus (issue #186)', () => {
    it('accepts the contract chip set and defaults unknown to open', () => {
        for (const s of [
            'open',
            'triaged',
            'in-progress',
            'fixed',
            'awaiting-customer',
            'closed',
        ] as const) {
            expect(parseStatus(s)).toBe(s);
        }
        expect(parseStatus('shipped')).toBe('open');
        expect(parseStatus(undefined)).toBe('open');
        expect(parseStatus(7)).toBe('open');
    });
});
